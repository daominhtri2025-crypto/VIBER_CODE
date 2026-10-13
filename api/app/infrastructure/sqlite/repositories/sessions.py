"""Learning sessions and solution steps.

Concurrency & idempotency contract (handoff §4.4, §6.3)
------------------------------------------------------
* Every mutation runs in one short ``BEGIN IMMEDIATE`` transaction.
* Every mutation that affects progress (step, state change) increments
  ``learning_sessions.version``; callers pass ``expected_version`` and get
  :class:`VersionConflict` if stale — nothing is partially written.
* ``request_id`` is the idempotency key for a step: same id + same payload ->
  the stored step is returned unchanged (no new row, no version bump); same
  id + different payload -> :class:`IdempotencyConflict`.
* The *base equation* is derived on the server: the last ``valid`` step's
  ``submitted_equation``, else ``math_spec.lhs = math_spec.rhs``. Invalid and
  unknown steps never become the base (handoff §5.2 step 5).
* ``math_status``/``error_code`` come from MathChecker (Phase 2), never from
  the client. This repository trusts its caller (the application service).
* Hints are recorded by :mod:`hints`; they do **not** bump the session
  version (decision D3 in docs/PHASE1_REPORT.md).
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from app.domain.constants import LearningMode, MathStatus, Role, SessionState
from app.domain.errors import (
    IdempotencyConflict, NotFound, StateConflict, ValidationFailed, VersionConflict,
)
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import (
    Clock, audit, iso, new_id, require_active_role, require_text, row, rows, utc_now,
)
from app.infrastructure.sqlite.repositories.assignments import AssignmentRepository

MAX_EQUATION_LEN = 200
MAX_EXPLANATION_LEN = 2000
MAX_REQUEST_ID_LEN = 64
STEP_PAYLOAD_FIELDS = ("previous_equation", "submitted_equation", "operation", "operation_value",
                       "explanation", "math_status", "error_code")


class SessionRepository:
    def __init__(self, conn: sqlite3.Connection, clock: Clock = utc_now):
        self.conn = conn
        self.clock = clock

    # ------------------------------------------------------------------ reads
    def _load(self, session_id: str) -> sqlite3.Row:
        s = self.conn.execute("SELECT * FROM learning_sessions WHERE id=?", (session_id,)).fetchone()
        if s is None:
            raise NotFound("Session not found")
        return s

    def get_for_owner(self, session_id: str, actor_id: str) -> dict:
        s = self._load(session_id)
        if s["student_id"] != actor_id:
            raise NotFound("Session not found")  # do not reveal existence
        return dict(s)

    def get_for_teacher(self, session_id: str, teacher_id: str) -> dict:
        """Teacher may read sessions of assignments in classes they own."""
        require_active_role(self.conn, teacher_id, Role.TEACHER)
        s = row(self.conn.execute(
            "SELECT s.* FROM learning_sessions s JOIN assignments a ON a.id=s.assignment_id"
            " JOIN classes c ON c.id=a.class_id WHERE s.id=? AND c.teacher_id=?",
            (session_id, teacher_id)).fetchone())
        if s is None:
            raise NotFound("Session not found")
        return s

    def list_steps(self, session_id: str) -> list[dict]:
        return rows(self.conn.execute(
            "SELECT * FROM solution_steps WHERE session_id=? ORDER BY step_index", (session_id,)))

    def current_equation(self, session_id: str) -> str:
        """Server-side base equation for the next step (never from payload)."""
        last_valid = self.conn.execute(
            "SELECT submitted_equation FROM solution_steps WHERE session_id=? AND math_status='valid'"
            " ORDER BY step_index DESC LIMIT 1", (session_id,)).fetchone()
        if last_valid:
            return last_valid[0]
        spec = self.conn.execute(
            "SELECT pv.math_spec FROM learning_sessions s JOIN problem_versions pv"
            " ON pv.problem_id=s.problem_id AND pv.version=s.problem_version WHERE s.id=?",
            (session_id,)).fetchone()
        if spec is None:
            raise NotFound("Session not found")
        m = json.loads(spec[0])
        return f"{m['lhs']}={m['rhs']}"

    def find_resumable(self, *, student_id: str, problem_id: str, problem_version: int,
                       assignment_id: str | None) -> dict | None:
        """Latest not-completed session for the same student/problem/assignment."""
        return row(self.conn.execute(
            "SELECT * FROM learning_sessions WHERE student_id=? AND problem_id=? AND problem_version=?"
            " AND assignment_id IS ? AND state<>'COMPLETED' ORDER BY started_at DESC LIMIT 1",
            (student_id, problem_id, problem_version, assignment_id)).fetchone())

    # -------------------------------------------------------------- mutations
    def create(self, *, student_id: str, problem_id: str, problem_version: int,
               learning_mode: LearningMode | str, assignment_id: str | None = None,
               ai_config_id: str | None = None, parent_session_id: str | None = None,
               study_id: str | None = None, initial_state: SessionState | str = SessionState.READ_PROBLEM,
               now: datetime | None = None) -> dict:
        require_active_role(self.conn, student_id, Role.STUDENT)
        if str(learning_mode) not in {m.value for m in LearningMode}:
            raise ValidationFailed("learning_mode invalid")
        if str(initial_state) in (SessionState.COMPLETED, SessionState.INDEPENDENT_PRACTICE) \
                and str(learning_mode) != LearningMode.INDEPENDENT:
            raise ValidationFailed("initial_state not allowed for this mode")
        if assignment_id is not None:
            a = AssignmentRepository(self.conn).get_for_student(assignment_id, student_id)
            if AssignmentRepository.is_past_due(a, now or self.clock()):
                raise StateConflict("Assignment is past due")
        sid = new_id()
        with transaction(self.conn):
            # DB triggers enforce: approved version, class membership, mode match, lineage rules.
            self.conn.execute(
                "INSERT INTO learning_sessions(id, student_id, problem_id, problem_version, assignment_id,"
                " ai_config_id, learning_mode, state, parent_session_id, study_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (sid, student_id, problem_id, problem_version, assignment_id, ai_config_id,
                 str(learning_mode), str(initial_state), parent_session_id, study_id))
            self.conn.execute("INSERT INTO activity_events(id, session_id, event_type) VALUES(?,?,'start')",
                              (new_id(), sid))
        return dict(self._load(sid))

    def submit_step(self, *, actor_id: str, session_id: str, expected_version: int, request_id: str,
                    previous_equation: str, submitted_equation: str, operation: str, explanation: str,
                    math_status: MathStatus | str, operation_value: str | None = None,
                    error_code: str | None = None) -> dict:
        """Persist one attempt atomically. Returns the step row (+ ``replayed`` flag)."""
        request_id = require_text("request_id", request_id, max_len=MAX_REQUEST_ID_LEN)
        payload = {
            "previous_equation": require_text("previous_equation", previous_equation, max_len=MAX_EQUATION_LEN),
            "submitted_equation": require_text("submitted_equation", submitted_equation, max_len=MAX_EQUATION_LEN),
            "operation": require_text("operation", operation, max_len=50),
            "operation_value": None if operation_value is None
            else require_text("operation_value", operation_value, max_len=50),
            "explanation": require_text("explanation", explanation, max_len=MAX_EXPLANATION_LEN, allow_empty=True),
            "math_status": str(math_status),
            "error_code": error_code,
        }
        if payload["math_status"] not in {s.value for s in MathStatus}:
            raise ValidationFailed("math_status invalid")
        if payload["math_status"] == MathStatus.INVALID and not error_code:
            raise ValidationFailed("invalid steps require an error_code")
        if payload["math_status"] == MathStatus.VALID and error_code:
            raise ValidationFailed("valid steps must not carry an error_code")

        with transaction(self.conn):
            s = self._load(session_id)
            if s["student_id"] != actor_id:
                raise NotFound("Session not found")
            require_active_role(self.conn, actor_id, Role.STUDENT)

            prior = self.conn.execute("SELECT * FROM solution_steps WHERE session_id=? AND request_id=?",
                                      (session_id, request_id)).fetchone()
            if prior is not None:
                if any(prior[k] != payload[k] for k in STEP_PAYLOAD_FIELDS):
                    raise IdempotencyConflict("request_id reused with a different payload")
                return {**dict(prior), "replayed": True}

            if s["state"] != SessionState.SOLVE_STEP:
                raise StateConflict(f"Session state {s['state']} does not accept solution steps")
            if s["version"] != expected_version:
                raise VersionConflict("Session version is stale",
                                      detail={"expected": expected_version, "actual": s["version"]})
            base = self.current_equation(session_id)
            if payload["previous_equation"] != base:
                # MathChecker validated against an out-of-date base equation.
                raise VersionConflict("previous_equation does not match the server base equation",
                                      detail={"base_equation": base})

            step_index = self.conn.execute(
                "SELECT coalesce(max(step_index),0)+1 FROM solution_steps WHERE session_id=?", (session_id,)
            ).fetchone()[0]
            step_id = new_id()
            self.conn.execute(
                "INSERT INTO solution_steps(id, session_id, step_index, request_id, previous_equation,"
                " submitted_equation, operation, operation_value, explanation, math_status, error_code)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (step_id, session_id, step_index, request_id, *(payload[k] for k in STEP_PAYLOAD_FIELDS)))
            self._bump_version(session_id, expected_version)
            self.conn.execute("INSERT INTO activity_events(id, session_id, event_type) VALUES(?,?,'submit')",
                              (new_id(), session_id))
            step = dict(self.conn.execute("SELECT * FROM solution_steps WHERE id=?", (step_id,)).fetchone())
        return {**step, "replayed": False}

    def transition_state(self, *, actor_id: str, session_id: str, expected_version: int,
                         to_state: SessionState | str, reason: str = "") -> dict:
        """Persist a state change decided by LearningStateMachine (Phase 2).

        Only structural invariants are enforced here (valid name, COMPLETED is
        terminal, version check); *sequence* validity belongs to the state
        machine.
        """
        to_state = str(to_state)
        if to_state not in {s.value for s in SessionState}:
            raise ValidationFailed("Unknown state")
        with transaction(self.conn):
            s = self._load(session_id)
            if s["student_id"] != actor_id:
                raise NotFound("Session not found")
            if s["version"] != expected_version:
                raise VersionConflict("Session version is stale",
                                      detail={"expected": expected_version, "actual": s["version"]})
            if s["state"] == SessionState.COMPLETED:
                raise StateConflict("Session already completed")
            if s["learning_mode"] == LearningMode.INDEPENDENT and to_state in (
                    SessionState.IDENTIFY_KNOWLEDGE, SessionState.PROPOSE_PLAN, SessionState.VERIFY_RESULT):
                raise StateConflict("Independent sessions do not use guided states")
            completed_at = iso(self.clock()) if to_state == SessionState.COMPLETED else None
            self.conn.execute("UPDATE learning_sessions SET state=?, completed_at=? WHERE id=?",
                              (to_state, completed_at, session_id))
            self._bump_version(session_id, expected_version)
            if to_state == SessionState.COMPLETED:
                self.conn.execute("INSERT INTO activity_events(id, session_id, event_type) VALUES(?,?,'finish')",
                                  (new_id(), session_id))
            audit(self.conn, actor_id=actor_id, action="session.transition", entity_type="learning_session",
                  entity_id=session_id, details={"from": s["state"], "to": to_state, "reason": reason[:200]})
        return dict(self._load(session_id))

    def record_activity(self, *, actor_id: str, session_id: str, event_type: str) -> None:
        if event_type not in ("pause", "resume", "heartbeat"):
            raise ValidationFailed("Only pause/resume/heartbeat are client-recordable")
        with transaction(self.conn):
            s = self._load(session_id)
            if s["student_id"] != actor_id:
                raise NotFound("Session not found")
            self.conn.execute("INSERT INTO activity_events(id, session_id, event_type) VALUES(?,?,?)",
                              (new_id(), session_id, event_type))

    def _bump_version(self, session_id: str, expected_version: int) -> None:
        cur = self.conn.execute("UPDATE learning_sessions SET version=version+1 WHERE id=? AND version=?",
                                (session_id, expected_version))
        if cur.rowcount != 1:  # defensive: cannot happen under BEGIN IMMEDIATE
            raise VersionConflict("Concurrent update detected")

