"""Pre/post/retention assessments (no AI, no hints, no correctness feedback).

Lifecycle enforced jointly with migration 0002 triggers::

    start_attempt -> save_response* (draft) -> submit_attempt (frozen) -> grade_response*

* Students only see ``statement`` of the fixed problem version — never
  ``teacher_solution`` or ``hints`` — and no scores before publication.
* Grading policy (decision D6, 13/10/2026): grader holds the ``researcher``
  role and is listed in ``study_researchers`` of the attempt's study
  (repository + DB trigger). The ``teacher`` role is NOT required.
"""
from __future__ import annotations

import sqlite3

from app.domain.constants import Role
from app.domain.errors import NotFound, PermissionDenied, StateConflict, ValidationFailed
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import (
    Clock, audit, iso, new_id, require_active_role, require_text, row, rows, utc_now,
)

SCORE_DECIMALS = 2


class AssessmentRepository:
    def __init__(self, conn: sqlite3.Connection, clock: Clock = utc_now, max_attempts: int = 1):
        self.conn = conn
        self.clock = clock
        self.max_attempts = max_attempts

    # ------------------------------------------------------------ helpers
    def _attempt_for_owner(self, attempt_id: str, student_id: str) -> sqlite3.Row:
        a = self.conn.execute(
            "SELECT a.* FROM assessment_attempts a JOIN study_participants p ON p.id=a.participant_id"
            " WHERE a.id=? AND p.student_id=?", (attempt_id, student_id)).fetchone()
        if a is None:
            raise NotFound("Attempt not found")
        return a

    # -------------------------------------------------------------- student
    def start_attempt(self, *, student_id: str, assessment_id: str) -> dict:
        """Create (or resume the open) attempt for the caller's participant record."""
        require_active_role(self.conn, student_id, Role.STUDENT)
        with transaction(self.conn):
            ctx = self.conn.execute(
                "SELECT s.id AS assessment_id, s.study_id, p.id AS participant_id FROM assessments s"
                " JOIN study_participants p ON p.study_id=s.study_id WHERE s.id=? AND p.student_id=?",
                (assessment_id, student_id)).fetchone()
            if ctx is None:
                raise NotFound("Assessment not found")
            if not self.conn.execute("SELECT 1 FROM assessment_items WHERE assessment_id=?",
                                     (assessment_id,)).fetchone():
                raise StateConflict("Assessment has no items")
            existing = rows(self.conn.execute(
                "SELECT * FROM assessment_attempts WHERE assessment_id=? AND participant_id=? ORDER BY attempt_no",
                (assessment_id, ctx["participant_id"])))
            open_ = [a for a in existing if a["submitted_at"] is None]
            if open_:
                return open_[-1]
            if len(existing) >= self.max_attempts:
                raise StateConflict("No attempts remaining")
            aid = new_id()
            self.conn.execute(
                "INSERT INTO assessment_attempts(id, study_id, assessment_id, participant_id, attempt_no, started_at)"
                " VALUES(?,?,?,?,?,?)",
                (aid, ctx["study_id"], assessment_id, ctx["participant_id"], len(existing) + 1, iso(self.clock())))
            return dict(self.conn.execute("SELECT * FROM assessment_attempts WHERE id=?", (aid,)).fetchone())

    def items_for_attempt(self, *, student_id: str, attempt_id: str) -> list[dict]:
        a = self._attempt_for_owner(attempt_id, student_id)
        return rows(self.conn.execute(
            "SELECT i.id AS item_id, i.position, pv.statement, i.max_solution_score, i.max_explanation_score,"
            " r.solution, r.explanation"
            " FROM assessment_items i JOIN problem_versions pv ON pv.problem_id=i.problem_id AND pv.version=i.problem_version"
            " LEFT JOIN item_responses r ON r.item_id=i.id AND r.attempt_id=?"
            " WHERE i.assessment_id=? ORDER BY i.position", (attempt_id, a["assessment_id"])))

    def save_response(self, *, student_id: str, attempt_id: str, item_id: str,
                      solution: str, explanation: str = "") -> dict:
        solution = require_text("solution", solution, max_len=2000, allow_empty=True)
        explanation = require_text("explanation", explanation, max_len=2000, allow_empty=True)
        with transaction(self.conn):
            a = self._attempt_for_owner(attempt_id, student_id)
            if a["submitted_at"] is not None:
                raise StateConflict("Attempt already submitted")
            if not self.conn.execute("SELECT 1 FROM assessment_items WHERE id=? AND assessment_id=?",
                                     (item_id, a["assessment_id"])).fetchone():
                raise NotFound("Item not found")
            self.conn.execute(
                "INSERT INTO item_responses(id, attempt_id, assessment_id, item_id, solution, explanation)"
                " VALUES(?,?,?,?,?,?) ON CONFLICT(attempt_id, item_id) DO UPDATE SET"
                " solution=excluded.solution, explanation=excluded.explanation",
                (new_id(), attempt_id, a["assessment_id"], item_id, solution, explanation))
            return dict(self.conn.execute(
                "SELECT id, attempt_id, item_id, solution, explanation FROM item_responses"
                " WHERE attempt_id=? AND item_id=?", (attempt_id, item_id)).fetchone())

    def submit_attempt(self, *, student_id: str, attempt_id: str, require_all_items: bool = True) -> dict:
        """Idempotent: submitting an already-submitted attempt returns it unchanged."""
        with transaction(self.conn):
            a = self._attempt_for_owner(attempt_id, student_id)
            if a["submitted_at"] is not None:
                return dict(a)
            if require_all_items:
                missing = self.conn.execute(
                    "SELECT count(*) FROM assessment_items i WHERE i.assessment_id=? AND NOT EXISTS("
                    " SELECT 1 FROM item_responses r WHERE r.item_id=i.id AND r.attempt_id=?"
                    " AND length(trim(r.solution))>0)", (a["assessment_id"], attempt_id)).fetchone()[0]
                if missing:
                    raise StateConflict(f"{missing} item(s) unanswered", detail={"unanswered": missing})
            self.conn.execute("UPDATE assessment_attempts SET submitted_at=? WHERE id=?",
                              (iso(self.clock()), attempt_id))
            audit(self.conn, actor_id=student_id, action="attempt.submit", entity_type="assessment_attempt",
                  entity_id=attempt_id)
            return dict(self.conn.execute("SELECT * FROM assessment_attempts WHERE id=?", (attempt_id,)).fetchone())

    # -------------------------------------------------------------- grading
    def grade_response(self, *, grader_id: str, response_id: str,
                       solution_score: float, explanation_score: float) -> dict:
        require_active_role(self.conn, grader_id, Role.RESEARCHER)
        try:
            scores = (round(float(solution_score), SCORE_DECIMALS), round(float(explanation_score), SCORE_DECIMALS))
        except (TypeError, ValueError) as exc:
            raise ValidationFailed("scores must be numbers") from exc
        if min(scores) < 0:
            raise ValidationFailed("scores must be non-negative")
        with transaction(self.conn):
            r = self.conn.execute(
                "SELECT r.id, r.attempt_id, a.study_id FROM item_responses r"
                " JOIN assessment_attempts a ON a.id=r.attempt_id WHERE r.id=?", (response_id,)).fetchone()
            if r is None:
                raise NotFound("Response not found")
            if not self.conn.execute("SELECT 1 FROM study_researchers WHERE study_id=? AND researcher_id=?",
                                     (r["study_id"], grader_id)).fetchone():
                raise PermissionDenied("Grader is not assigned to this study")
            # Triggers enforce: submitted first, score <= item maximum.
            self.conn.execute(
                "UPDATE item_responses SET solution_score=?, explanation_score=?, grader_id=? WHERE id=?",
                (*scores, grader_id, response_id))
            audit(self.conn, actor_id=grader_id, action="response.grade", entity_type="item_response",
                  entity_id=response_id, details={"solution_score": scores[0], "explanation_score": scores[1]})
            return dict(self.conn.execute("SELECT * FROM item_responses WHERE id=?", (response_id,)).fetchone())

    def totals(self, attempt_id: str) -> dict:
        t = row(self.conn.execute("SELECT * FROM assessment_totals WHERE attempt_id=?", (attempt_id,)).fetchone())
        if t is None:
            raise NotFound("Attempt not found")
        return t
