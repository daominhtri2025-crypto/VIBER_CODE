"""SessionService — orchestrates one learning session (handoff §5.2).

Decision authority (handoff §3.2) is respected strictly:

* MathChecker decides correctness; the client never supplies ``math_status``,
  the base equation or the state.
* LearningStateMachine decides transitions from server-derived events.
* HintPolicy decides whether/which hint level is allowed.
* Feedback is rendered from teacher-approved templates (``content/``) and
  passed through the answer-leak guard. No AI in Phase 2.

Transaction pattern (handoff §6.3): pure computation first (parse/check/
render) → one short repository transaction that writes the step/answer, its
feedback message and the state change together. Retries with the same
``request_id`` are replayed from stored data and produce the same reply.

Independent mode never returns correctness, feedback or hints before
submission; results are still stored for research.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field, replace
from fractions import Fraction
from typing import Any

from app.domain.constants import HintTrigger, LearningMode, SessionState
from app.domain.errors import IdempotencyConflict, StateConflict, ValidationFailed
from app.domain.learning import hint_policy
from app.domain.learning.hint_policy import Kind, ScopeEvent
from app.domain.learning.leak_guard import leaks_answer
from app.domain.learning.state_machine import Event, initial_state, next_state, require_state
from app.domain.math.ast import ErrorCode, Var
from app.domain.math.checker import CheckResult, Equation, MathChecker, SolutionKind, Status, final_form
from app.infrastructure.content_store import ContentStore
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories import (
    AssignmentRepository, ContentRepository, HintRepository, SessionRepository,
)
from app.infrastructure.sqlite.repositories._common import envelope
from app.infrastructure.sqlite.repositories.sessions import CHECK_OPERATIONS

STAGE_FAILURES_BEFORE_SUPPORT = 3  # knowledge/plan: advance with support after 3 rejections


@dataclass(frozen=True)
class TutorReply:
    """Student-facing reply. Never contains teacher_solution, internal hints or the answer."""
    session_id: str
    session_version: int
    state: str
    feedback: str = ""
    question: str = ""
    math_status: str | None = None      # None in independent mode (no correctness before submit)
    error_code: str | None = None
    step_id: str | None = None
    hint_level: int = 0                 # 0 = no hint in this reply (hint_events only store 1..3)
    hint: str | None = None
    hint_trigger: str | None = None
    needs_teacher: bool = False
    options: list[dict] | None = None   # safe options (id, label) for knowledge/plan stages
    next_session_id: str | None = None
    replayed: bool = False
    summary: dict | None = None
    extra: dict = field(default_factory=dict)


class SessionService:
    def __init__(self, conn: sqlite3.Connection, *, content: ContentStore | None = None,
                 checker: MathChecker | None = None):
        self.conn = conn
        self.sessions = SessionRepository(conn)
        self.hints = HintRepository(conn)
        self.problems = ContentRepository(conn)
        self.assignments = AssignmentRepository(conn)
        self.content = content or ContentStore()
        self.checker = checker or MathChecker()
        self.t = self.content.templates()

    # ================================================================ helpers
    def _problem(self, s: dict) -> dict:
        return self.problems.get_version_internal(s["problem_id"], s["problem_version"])

    def _original(self, s: dict) -> str:
        spec = self._problem(s)["math_spec"]
        return f"{spec['lhs']}={spec['rhs']}"

    def _solution_value(self, s: dict) -> Fraction | None:
        kind, value = Equation.parse(self._original(s)).solution()
        return value if kind == SolutionKind.SINGLE else None

    def _render(self, s: dict, text: str, **values: Any) -> str:
        """Fill whitelisted placeholders, then run the leak guard (fallback = state question)."""
        out = text
        for k, v in values.items():
            out = out.replace("{" + k + "}", "" if v is None else str(v))
        visible = " ".join([self._problem(s)["statement"], self._original(s), self.sessions.current_equation(s["id"])])
        if leaks_answer(out, self._solution_value(s), visible):
            return self.t["state_questions"]["SOLVE_STEP"]
        return out

    def _scope(self, s: dict) -> str:
        if s["state"] != SessionState.SOLVE_STEP:
            return s["state"]
        anchor = self.conn.execute(
            "SELECT id FROM solution_steps WHERE session_id=? AND math_status='valid' AND operation NOT IN (?,?)"
            " ORDER BY step_index DESC LIMIT 1", (s["id"], *CHECK_OPERATIONS)).fetchone()
        return f"SOLVE_STEP:{anchor[0] if anchor else 'start'}"

    def _history(self, session_id: str, scope: str) -> list[ScopeEvent]:
        events = []
        for m in self.sessions.list_messages(session_id):
            meta = m["meta"]
            if meta.get("scope") != scope:
                continue
            if meta.get("kind") == "attempt":
                events.append(ScopeEvent(Kind.ATTEMPT, failed=meta.get("outcome") in ("invalid", "rejected")))
            elif meta.get("kind") == "hint":
                events.append(ScopeEvent(Kind.HINT, level=int(meta.get("level", 0))))
        return events

    def _options(self, s: dict) -> list[dict] | None:
        if s["learning_mode"] != LearningMode.GUIDED:
            return None
        stage = {"IDENTIFY_KNOWLEDGE": "knowledge", "PROPOSE_PLAN": "plan"}.get(s["state"])
        if stage is None:
            return None
        return [{"id": o["id"], "label": o["label"]} for o in self.content.problem(
            s["problem_id"], s["problem_version"])[stage]["options"]]

    def _question(self, s: dict) -> str:
        if s["state"] == SessionState.VERIFY_RESULT:
            kind, _ = final_form(Equation.parse(self.sessions.current_equation(s["id"])))
            if kind in (SolutionKind.NONE, SolutionKind.INFINITE):
                return self.t["state_questions"]["VERIFY_RESULT_CONCLUDE"]
        return self.t["state_questions"][s["state"]]

    def _reply(self, s: dict, **kw: Any) -> TutorReply:
        kw.setdefault("question", self._question(s))
        kw.setdefault("options", self._options(s))
        return TutorReply(session_id=s["id"], session_version=s["version"], state=s["state"], **kw)

    def _load(self, student_id: str, session_id: str) -> dict:
        return self.sessions.get_for_owner(session_id, student_id)

    # ============================================================ lifecycle
    def start(self, *, student_id: str, problem_id: str, problem_version: int,
              assignment_id: str | None = None, mode: str = LearningMode.GUIDED,
              ai_config_id: str | None = None) -> TutorReply:
        """Create or resume a session. With an assignment, its learning_mode wins.

        ``ai_config_id`` (the active config at creation) is frozen on the session so
        later config changes never alter a running/historical session. The session
        is linked to a study only when the student participates in exactly ONE
        study that is currently running (unambiguous link, handoff §5.6 step 8).
        """
        if assignment_id is not None:
            mode = self.assignments.get_for_student(assignment_id, student_id)["learning_mode"]
        existing = self.sessions.find_resumable(student_id=student_id, problem_id=problem_id,
                                                problem_version=problem_version, assignment_id=assignment_id)
        if existing is not None:
            return self._reply(existing, extra={"resumed": True})
        if mode == LearningMode.GUIDED:
            self.content.problem(problem_id, problem_version)  # guided needs the approved catalogue
        s = self.sessions.create(student_id=student_id, problem_id=problem_id, problem_version=problem_version,
                                 learning_mode=mode, assignment_id=assignment_id, initial_state=initial_state(mode),
                                 ai_config_id=None if mode == LearningMode.INDEPENDENT else ai_config_id,
                                 study_id=self._running_study(student_id))
        return self._reply(s, extra={"resumed": False})

    def _running_study(self, student_id: str) -> str | None:
        now = self.sessions.clock().strftime("%Y-%m-%dT%H:%M:%S")
        studies = [r[0] for r in self.conn.execute(
            "SELECT s.id FROM study_participants p JOIN studies s ON s.id=p.study_id WHERE p.student_id=?"
            " AND (s.start_at IS NULL OR s.start_at<=?) AND (s.end_at IS NULL OR s.end_at>=?)",
            (student_id, now, now))]
        return studies[0] if len(studies) == 1 else None

    def view(self, *, student_id: str, session_id: str) -> TutorReply:
        s = self._load(student_id, session_id)
        current = self.sessions.current_equation(s["id"])
        kind, _ = final_form(Equation.parse(current))
        return self._reply(s, extra={
            "statement": self._problem(s)["statement"],
            "current_equation": current,
            # VERIFY_RESULT input type: write a substitution, or pick a conclusion for x-free forms
            "learning_mode": s["learning_mode"],
            "verify_mode": "conclusion" if kind in (SolutionKind.NONE, SolutionKind.INFINITE) else "substitution",
            "parent_session_id": s["parent_session_id"],
            "child_session_id": (self.sessions.find_child(s["id"]) or {}).get("id"),
            "steps": [{k: st[k] for k in ("step_index", "submitted_equation", "operation", "operation_value",
                                          "explanation")}
                      | ({} if s["learning_mode"] == LearningMode.INDEPENDENT and s["state"] != SessionState.COMPLETED
                         else {"math_status": st["math_status"]})
                      for st in self.sessions.list_steps(s["id"])],
        })

    # ======================================================== READ / KNOWLEDGE / PLAN
    def read_problem(self, *, student_id: str, session_id: str, expected_version: int,
                     request_id: str, restatement: str) -> TutorReply:
        s = self._load(student_id, session_id)
        cat = self.content.problem(s["problem_id"], s["problem_version"])["read_problem"]
        accepted = len((restatement or "").strip()) >= int(cat["min_chars"])
        return self._stage_answer(s, expected_version, request_id, stage="READ_PROBLEM", choice=None,
                                  text=restatement, accepted=accepted, event=Event.PROBLEM_READ,
                                  feedback_key=("read_problem", "accepted" if accepted else "too_short"))

    def answer_knowledge(self, *, student_id: str, session_id: str, expected_version: int,
                         request_id: str, option_id: str, explanation: str = "") -> TutorReply:
        s = self._load(student_id, session_id)
        options = self.content.problem(s["problem_id"], s["problem_version"])["knowledge"]["options"]
        option = next((o for o in options if o["id"] == option_id), None)
        if option is None:
            raise ValidationFailed("Unknown option", detail={"option_id": option_id})
        support = next(o["label"] for o in options if o["correct"])
        return self._stage_answer(s, expected_version, request_id, stage="IDENTIFY_KNOWLEDGE", choice=option_id,
                                  text=explanation, accepted=bool(option["correct"]),
                                  event=Event.KNOWLEDGE_ACCEPTED, feedback_key=("knowledge", None),
                                  support_value=support)

    def answer_plan(self, *, student_id: str, session_id: str, expected_version: int,
                    request_id: str, option_id: str, explanation: str = "") -> TutorReply:
        s = self._load(student_id, session_id)
        options = self.content.problem(s["problem_id"], s["problem_version"])["plan"]["options"]
        option = next((o for o in options if o["id"] == option_id), None)
        if option is None:
            raise ValidationFailed("Unknown option", detail={"option_id": option_id})
        # Catalogue flag AND MathChecker must agree that the first operation is applicable.
        check = self.checker.check_plan(self._original(s), option["operation"], option.get("value"))
        accepted = bool(option["acceptable"]) and check.status == Status.VALID
        support = next(o["label"] for o in options if o["acceptable"])
        return self._stage_answer(s, expected_version, request_id, stage="PROPOSE_PLAN", choice=option_id,
                                  text=explanation, accepted=accepted, event=Event.PLAN_ACCEPTED,
                                  feedback_key=("plan", None), support_value=support)

    def _stage_answer(self, s: dict, expected_version: int, request_id: str, *, stage: str, choice: str | None,
                      text: str, accepted: bool, event: Event, feedback_key: tuple[str, str | None],
                      support_value: str | None = None) -> TutorReply:
        prior = self.sessions.find_interaction(s["id"], request_id)
        if prior is not None:  # replay: rebuild the reply from what was stored
            meta = self.sessions.list_messages(s["id"])
            stored = next(m for m in meta if m["id"] == prior["id"])["meta"]
            if stored.get("choice") != choice or stored.get("stage") != stage:
                raise IdempotencyConflict("request_id reused with a different answer")
            return self._with_stored_offer(s, request_id, self._stage_reply(
                self._load(s["student_id"], s["id"]), stored, feedback_key, support_value, replayed=True))

        require_state(s["state"], SessionState(stage))
        history = self._history(s["id"], stage)
        failures = sum(1 for e in history if e.kind == Kind.ATTEMPT and e.failed) + (0 if accepted else 1)
        supported = (not accepted and stage != "READ_PROBLEM" and failures >= STAGE_FAILURES_BEFORE_SUPPORT)
        advance = accepted or supported
        meta = {"kind": "attempt", "stage": stage, "scope": stage, "request_id": request_id, "choice": choice,
                "outcome": "accepted" if accepted else "rejected", "advanced_with_support": supported}
        reply_text = self._stage_feedback(s, feedback_key, meta, support_value)
        after = self.sessions.record_interaction(
            actor_id=s["student_id"], session_id=s["id"], expected_version=expected_version, request_id=request_id,
            accept_states=(stage,),
            transition_to=next_state(s["learning_mode"], s["state"], event) if advance else None,
            messages=[("student", envelope(text or "", **meta)),
                      ("system", envelope(reply_text, kind="feedback", scope=stage))])
        reply = self._stage_reply(after, meta, feedback_key, support_value, replayed=after["replayed"])
        if not advance:
            reply = self._maybe_offer(after, stage, request_id, step_id=None, base=reply)
        return reply

    def _stage_feedback(self, s: dict, key: tuple[str, str | None], meta: dict, support_value: str | None) -> str:
        group, fixed = key
        if fixed is not None:
            return self.t[group][fixed]
        if meta["advanced_with_support"]:
            return self._render(s, self.t[group]["advanced_with_support"], value=support_value)
        return self.t[group]["accepted" if meta["outcome"] == "accepted" else "rejected"]

    def _stage_reply(self, s: dict, meta: dict, key: tuple[str, str | None], support_value: str | None,
                     *, replayed: bool) -> TutorReply:
        if key[0] == "read_problem":
            key = ("read_problem", "accepted" if meta["outcome"] == "accepted" else "too_short")
        return self._reply(s, feedback=self._stage_feedback(s, key, meta, support_value), replayed=replayed,
                           extra={"accepted": meta["outcome"] == "accepted",
                                  "advanced_with_support": meta.get("advanced_with_support", False)})

    # ================================================================ STEPS
    def submit_step(self, *, student_id: str, session_id: str, expected_version: int, request_id: str,
                    submitted_equation: str, operation: str, operation_value: str | None = None,
                    explanation: str = "") -> TutorReply:
        s = self._load(student_id, session_id)
        prior = self.conn.execute("SELECT * FROM solution_steps WHERE session_id=? AND request_id=?",
                                  (session_id, request_id)).fetchone()
        if prior is not None:
            same = (prior["submitted_equation"], prior["operation"], prior["operation_value"], prior["explanation"]) \
                == (submitted_equation.strip(), operation.strip(), operation_value and operation_value.strip(),
                    (explanation or "").strip())
            if not same:
                raise IdempotencyConflict("request_id reused with a different payload")
            return self._with_stored_offer(s, request_id,
                                           self._step_reply(s, dict(prior), self._recheck(dict(prior)), replayed=True))

        require_state(s["state"], SessionState.SOLVE_STEP)
        base = self.sessions.current_equation(session_id)
        result = self.checker.check_step(base, submitted_equation, operation, operation_value)
        independent = s["learning_mode"] == LearningMode.INDEPENDENT
        transition = None
        if result.status == Status.VALID and result.final_form is not None and not independent:
            transition = next_state(s["learning_mode"], s["state"], Event.FINAL_FORM_REACHED)
        scope = self._scope(s)
        messages = [] if independent else [("system", envelope(
            self._step_texts(s, result, submitted_equation)[0], kind="attempt", scope=scope,
            outcome=result.status.value, error_code=result.error_code.value if result.error_code else None,
            request_id=request_id))]
        step = self.sessions.submit_step(
            actor_id=student_id, session_id=session_id, expected_version=expected_version, request_id=request_id,
            previous_equation=base, submitted_equation=submitted_equation, operation=operation,
            operation_value=operation_value, explanation=explanation, math_status=result.math_status,
            error_code=result.error_code.value if result.error_code else None,
            transition_to=transition, messages=messages)
        after = self._load(student_id, session_id)
        reply = self._step_reply(after, step, result, replayed=step["replayed"])
        if not independent and result.status == Status.INVALID:
            reply = self._maybe_offer(after, scope, request_id, step_id=step["id"], base=reply)
        return reply

    def _recheck(self, step: dict) -> CheckResult:
        """Deterministic re-evaluation of a stored step (for replays)."""
        if step["operation"] == "verify_substitution":
            return CheckResult(Status(step["math_status"]),
                               ErrorCode(step["error_code"]) if step["error_code"] else None)
        if step["operation"] == "conclude":
            return self.checker.check_conclusion(step["previous_equation"], step["submitted_equation"])
        return self.checker.check_step(step["previous_equation"], step["submitted_equation"],
                                       step["operation"], step["operation_value"])

    def _step_texts(self, s: dict, result: CheckResult, submitted: str) -> tuple[str, str]:
        st = self.t["step"]
        if result.status == Status.VALID:
            if result.final_form == SolutionKind.SINGLE:
                tpl = st["valid_final_single"]
            elif result.final_form is not None:
                tpl = st["valid_final_x_free"]
            elif Var() in (Equation.parse(submitted).lhs, Equation.parse(submitted).rhs):
                tpl = st["valid_needs_simplify"]  # x isolated but the other side is not simplest yet
            else:
                tpl = st["valid"]
        elif result.status == Status.UNKNOWN:
            tpl = st["unknown"][result.error_code.value]
        else:
            tpl = st["invalid"][result.error_code.value]
        side = {"left": "trái", "right": "phải"}.get(result.detail.get("side", ""), "")
        return self._render(s, tpl["feedback"], side=side), self._render(s, tpl["question"], side=side)

    def _step_reply(self, s: dict, step: dict, result: CheckResult, *, replayed: bool) -> TutorReply:
        if s["learning_mode"] == LearningMode.INDEPENDENT:
            return self._reply(s, feedback=self.t["independent"]["saved"], question="", step_id=step["id"],
                               replayed=replayed)
        feedback, question = self._step_texts(s, result, step["submitted_equation"])
        return self._reply(s, feedback=feedback, question=question, math_status=result.math_status,
                           error_code=result.error_code.value if result.error_code else None,
                           step_id=step["id"], replayed=replayed)

    # ================================================================ HINTS
    def _hint_text(self, s: dict, scope: str, level: int) -> str:
        h = self.t["hints"]
        base = self.sessions.current_equation(s["id"])
        if scope == "SOLVE_STEP:start":
            problem_hints = self._problem(s)["hints"]
            if len(problem_hints) >= level:
                return self._render(s, problem_hints[level - 1])
        if scope.startswith("SOLVE_STEP"):
            strategy, value = self.checker.suggest_next(base)
            return self._render(s, h["strategy"][strategy][level - 1], value=value)
        if scope == "VERIFY_RESULT":
            kind, _ = final_form(Equation.parse(base))
            if kind in (SolutionKind.NONE, SolutionKind.INFINITE):
                return self._render(s, h["strategy"]["conclude"][level - 1])
            return self._render(s, h["VERIFY_RESULT"][level - 1])
        if scope == "PROPOSE_PLAN":
            strategy, value = self.checker.suggest_next(self._original(s))
            if value is None:
                return self._render(s, h["strategy"][strategy][level - 1])
            return self._render(s, h["PROPOSE_PLAN"][level - 1], value=value)
        return self._render(s, h[scope][level - 1])

    def _record_hint(self, s: dict, scope: str, request_id: str, level: int, trigger: HintTrigger,
                     step_id: str | None) -> dict:
        text = self._hint_text(s, scope, level)
        return self.hints.record(
            actor_id=s["student_id"], session_id=s["id"], request_id=request_id, hint_level=level,
            trigger=trigger, content=text, step_id=step_id, scope=scope,
            messages=[("system", envelope(text, kind="hint", scope=scope, level=level, trigger=str(trigger),
                                          hint_id="{hint_id}"))])

    def request_hint(self, *, student_id: str, session_id: str, request_id: str) -> TutorReply:
        s = self._load(student_id, session_id)
        prior = self.hints.get_by_request(session_id, request_id)
        if prior is not None:
            return self._reply(s, hint=prior["content"], hint_level=prior["hint_level"],
                               hint_trigger=prior["trigger"], replayed=True)
        scope = self._scope(s)
        decision = hint_policy.on_request(s["learning_mode"], s["state"], self._history(session_id, scope))
        if not decision.allowed:
            if decision.reason == "blocked":
                raise StateConflict("Hints are not available here",
                                    detail={"mode": s["learning_mode"], "state": s["state"]})
            self._flag_teacher(s, scope)
            return self._reply(s, feedback=self.t["hint_denied"]["max_level"], needs_teacher=True)
        last_step = self.conn.execute("SELECT id FROM solution_steps WHERE session_id=? ORDER BY step_index DESC"
                                      " LIMIT 1", (session_id,)).fetchone()
        h = self._record_hint(s, scope, request_id, decision.level, HintTrigger.STUDENT_REQUEST,
                              last_step[0] if last_step else None)
        return self._reply(s, hint=h["content"], hint_level=h["hint_level"], hint_trigger=h["trigger"],
                           replayed=h["replayed"])

    def _maybe_offer(self, s: dict, scope: str, request_id: str, *, step_id: str | None,
                     base: TutorReply) -> TutorReply:
        offer_id = f"{request_id}:offer"
        existing = self.hints.get_by_request(s["id"], offer_id)
        if existing is None:
            decision = hint_policy.after_attempt(s["learning_mode"], s["state"], self._history(s["id"], scope))
            if decision.needs_teacher:
                self._flag_teacher(s, scope)
                return _replace(base, needs_teacher=True,
                                feedback=f"{base.feedback} {self.t['needs_teacher']}".strip())
            if not decision.allowed:
                return base
            existing = self._record_hint(s, scope, offer_id, decision.level, HintTrigger.SYSTEM_OFFER, step_id)
        return _replace(base, hint=existing["content"], hint_level=existing["hint_level"],
                        hint_trigger=existing["trigger"])

    def _with_stored_offer(self, s: dict, request_id: str, reply: TutorReply) -> TutorReply:
        """Replays must return the same system-offered hint as the original reply."""
        offer = self.hints.get_by_request(s["id"], f"{request_id}:offer")
        if offer is None:
            return reply
        return _replace(reply, hint=offer["content"], hint_level=offer["hint_level"], hint_trigger=offer["trigger"])

    def _flag_teacher(self, s: dict, scope: str) -> None:
        """One 'needs_teacher' flag per scope (teacher dashboard reads it in Phase 3)."""
        if any(m["meta"].get("kind") == "flag" and m["meta"].get("scope") == scope
               for m in self.sessions.list_messages(s["id"])):
            return
        with transaction(self.conn):
            self.sessions._insert_messages(s["id"], [("system", envelope(
                self.t["needs_teacher"], kind="flag", scope=scope, flag="needs_teacher"))])

    # ================================================================ VERIFY
    def verify(self, *, student_id: str, session_id: str, expected_version: int, request_id: str,
               substitution: str | None = None, conclusion: str | None = None) -> TutorReply:
        s = self._load(student_id, session_id)
        prior = self.conn.execute("SELECT * FROM solution_steps WHERE session_id=? AND request_id=?",
                                  (session_id, request_id)).fetchone()
        if prior is not None:
            if prior["submitted_equation"] != (substitution or conclusion or "").strip():
                raise IdempotencyConflict("request_id reused with a different payload")
            return self._with_stored_offer(s, request_id, self._verify_reply(
                self._load(student_id, session_id), dict(prior), replayed=True))

        require_state(s["state"], SessionState.VERIFY_RESULT)
        base = self.sessions.current_equation(session_id)
        kind, value = final_form(Equation.parse(base))
        if kind == SolutionKind.SINGLE:
            if not substitution:
                raise ValidationFailed("substitution is required for a single-solution equation")
            result = self.checker.verify_substitution(self._original(s), value, substitution)
            operation, submitted = "verify_substitution", substitution
        else:
            if not conclusion:
                raise ValidationFailed("conclusion is required (no_solution | infinite_solutions)")
            result = self.checker.check_conclusion(base, conclusion)
            operation, submitted = "conclude", conclusion
        transition = next_state(s["learning_mode"], s["state"], Event.VERIFIED) if result.status == Status.VALID \
            else None
        step = self.sessions.submit_step(
            actor_id=student_id, session_id=session_id, expected_version=expected_version, request_id=request_id,
            previous_equation=base, submitted_equation=submitted, operation=operation, explanation="",
            math_status=result.math_status, error_code=result.error_code.value if result.error_code else None,
            accept_states=(SessionState.VERIFY_RESULT,), transition_to=transition,
            messages=[("system", envelope("", kind="attempt", scope="VERIFY_RESULT", outcome=result.status.value,
                                          request_id=request_id))])
        after = self._load(student_id, session_id)
        reply = self._verify_reply(after, step, replayed=step["replayed"])
        if result.status == Status.INVALID:
            reply = self._maybe_offer(after, "VERIFY_RESULT", request_id, step_id=step["id"], base=reply)
        return reply

    def _verify_reply(self, s: dict, step: dict, *, replayed: bool) -> TutorReply:
        ok = step["math_status"] == Status.VALID
        key = ("conclusion_" if step["operation"] == "conclude" else "") + ("ok" if ok else "fail")
        tpl = self.t["verify"][key]
        next_id = None
        if ok and s["state"] == SessionState.INDEPENDENT_PRACTICE:
            child = self.ensure_independent_practice(student_id=s["student_id"], parent_session_id=s["id"])
            next_id = child["id"] if child else None
        question = tpl["question"] if (not ok or next_id) else self.t["state_questions"]["COMPLETED"]
        return self._reply(s, feedback=tpl["feedback"], question=question, math_status=step["math_status"],
                           error_code=step["error_code"], step_id=step["id"], next_session_id=next_id,
                           replayed=replayed, extra={} if (not ok or next_id) else {"no_similar_problem": True})

    # =================================================== INDEPENDENT PRACTICE
    def ensure_independent_practice(self, *, student_id: str, parent_session_id: str) -> dict | None:
        """Idempotent: return the existing child or create one (Q9). None if no similar problem."""
        parent = self._load(student_id, parent_session_id)
        child = self.sessions.find_child(parent_session_id)
        if child is not None:
            return child
        if parent["state"] != SessionState.INDEPENDENT_PRACTICE:
            raise StateConflict("Parent session is not in INDEPENDENT_PRACTICE")
        similar = self.sessions.find_similar_problem(student_id=student_id, problem_id=parent["problem_id"],
                                                     problem_version=parent["problem_version"])
        if similar is None:
            return None
        return self.sessions.create(student_id=student_id, problem_id=similar[0], problem_version=similar[1],
                                    learning_mode=LearningMode.INDEPENDENT, parent_session_id=parent_session_id,
                                    study_id=parent["study_id"], initial_state=SessionState.SOLVE_STEP)

    def submit_independent(self, *, student_id: str, session_id: str, expected_version: int) -> TutorReply:
        s = self._load(student_id, session_id)
        done = self.sessions.complete_independent(actor_id=student_id, session_id=session_id,
                                                  expected_version=expected_version)
        steps = [st for st in self.sessions.list_steps(session_id) if st["operation"] not in CHECK_OPERATIONS]
        last_valid = next((st for st in reversed(steps) if st["math_status"] == "valid"), None)
        truth = Equation.parse(self._original(s)).solution()
        reached = False
        if last_valid is not None:
            kind, value = final_form(Equation.parse(last_valid["submitted_equation"]))
            reached = kind is not None and (kind, value) == truth
        summary = {"steps": len(steps), "invalid_steps": sum(st["math_status"] == "invalid" for st in steps),
                   "reached_correct_final_form": reached}
        return self._reply(done, feedback=self.t["independent"]["submitted"], question="",
                           replayed=done["replayed"], summary=summary)


def _replace(reply: TutorReply, **changes: Any) -> TutorReply:
    return replace(reply, **changes)
