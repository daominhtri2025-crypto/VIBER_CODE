"""AI phrasing layer on top of SessionService replies (handoff §6.3–6.4).

Order of operations (never inside the step's write transaction):

1. SessionService has ALREADY committed the step/hint with template feedback.
2. Eligibility: AI enabled, not independent, active config, quota and daily
   budget available (decision 14/10/2026: 30/session, 100/student/day).
3. Build a PII-free context (no names/ids/free text — only problem text written
   by the teacher, the server base equation, and whitelist-parsed math).
4. One bounded call; timeout/transport/bad output -> template fallback.
5. Output guard: schema, length, hint level, answer leak, contradiction with
   MathChecker, links/contacts. Any violation -> template fallback.
6. Stale check: if the session version moved meanwhile, the AI text is dropped.
7. On success, store the AI message (with ai_config_id) and a usage row in one
   short transaction; the reply is returned with ``ai_generated=True``.

Every decision is logged in ``ai_usage`` (outcome) for cost control and research.
"""
from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone

from app.application.session_service import TutorReply
from app.config import Settings
from app.domain.constants import LearningMode
from app.domain.math.checker import Equation, SolutionKind
from app.domain.tutor_ai import Purpose, TutorAI, TutorAIError, TutorContext, check_output
from app.infrastructure.content_store import ContentStore
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import envelope, iso, new_id, row

CALL_OUTCOMES = ("ok", "fallback_invalid", "fallback_timeout", "fallback_error")
AI_DISCLOSURE = "Phản hồi này do trợ lý AI tạo ra và đã được hệ thống kiểm tra Toán đối chiếu."


@dataclass(frozen=True)
class AIResult:
    reply: TutorReply
    ai_generated: bool
    outcome: str | None
    message_id: str | None = None


class AIFeedbackService:
    def __init__(self, conn: sqlite3.Connection, settings: Settings, tutor: TutorAI | None,
                 content: ContentStore | None = None, clock=lambda: datetime.now(timezone.utc)):
        self.conn = conn
        self.s = settings
        self.tutor = tutor
        self.content = content or ContentStore()
        self.clock = clock

    # ------------------------------------------------------------- config
    def active_config(self) -> dict | None:
        r = row(self.conn.execute(
            "SELECT c.* FROM ai_config_activations a JOIN ai_configs c ON c.id=a.ai_config_id"
            " ORDER BY a.activated_at DESC, a.rowid DESC LIMIT 1").fetchone())
        if r is not None:
            r["parameters"] = json.loads(r["parameters"])
        return r

    def _config(self, session: dict) -> dict | None:
        if session["ai_config_id"]:
            r = row(self.conn.execute("SELECT * FROM ai_configs WHERE id=?", (session["ai_config_id"],)).fetchone())
            if r is not None:
                r["parameters"] = json.loads(r["parameters"])
                return r if r["provider"] == getattr(self.tutor, "provider", None) else None
        return None

    # -------------------------------------------------------------- quota
    def _day_start_utc(self) -> str:
        offset = timedelta(hours=self.s.quota_timezone_offset_hours)
        local = self.clock() + offset
        start_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
        return iso(start_local - offset)

    def _quota_outcome(self, session_id: str, student_id: str) -> str | None:
        placeholders = ",".join("?" * len(CALL_OUTCOMES))
        per_session = self.conn.execute(
            f"SELECT count(*) FROM ai_usage WHERE session_id=? AND outcome IN ({placeholders})",
            (session_id, *CALL_OUTCOMES)).fetchone()[0]
        if per_session >= self.s.ai_quota_per_session:
            return "skipped_quota"
        day = self._day_start_utc()
        per_day = self.conn.execute(
            f"SELECT count(*) FROM ai_usage WHERE student_id=? AND occurred_at>=? AND outcome IN ({placeholders})",
            (student_id, day, *CALL_OUTCOMES)).fetchone()[0]
        if per_day >= self.s.ai_quota_per_student_per_day:
            return "skipped_quota"
        spent = self.conn.execute("SELECT coalesce(sum(cost_usd),0) FROM ai_usage WHERE occurred_at>=?",
                                  (day,)).fetchone()[0]
        if spent >= self.s.ai_daily_budget_usd:
            return "skipped_budget"
        return None

    def _log(self, *, session: dict, config: dict | None, purpose: Purpose, outcome: str,
             input_tokens: int | None = None, output_tokens: int | None = None, cost: float = 0.0,
             latency_ms: int | None = None, detail: str | None = None, message: tuple[str, str] | None = None) -> str | None:
        mid = None
        with transaction(self.conn):
            self.conn.execute(
                "INSERT INTO ai_usage(id, session_id, student_id, ai_config_id, purpose, outcome, input_tokens,"
                " output_tokens, cost_usd, latency_ms, detail) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (new_id(), session["id"], session["student_id"], config["id"] if config else None, str(purpose),
                 outcome, input_tokens, output_tokens, cost, latency_ms, (detail or "")[:500] or None))
            if message is not None:
                mid = new_id()
                self.conn.execute("INSERT INTO messages(id, session_id, sender_type, content, ai_config_id)"
                                  " VALUES(?,?,'assistant',?,?)", (mid, session["id"], message[1], config["id"]))
        return mid

    # ------------------------------------------------------------ enhance
    def enhance(self, reply: TutorReply, *, purpose: Purpose) -> AIResult:
        session = row(self.conn.execute("SELECT * FROM learning_sessions WHERE id=?", (reply.session_id,)).fetchone())
        if (not self.s.ai_enabled or self.tutor is None or session is None
                or session["learning_mode"] == LearningMode.INDEPENDENT or reply.replayed):
            return AIResult(reply, False, None)
        if purpose == Purpose.HINT and not reply.hint:
            return AIResult(reply, False, None)
        if purpose != Purpose.HINT and not reply.step_id:
            return AIResult(reply, False, None)
        config = self._config(session)
        if config is None:
            return AIResult(reply, False, self._log_skip(session, None, purpose, "skipped_disabled"))
        blocked = self._quota_outcome(session["id"], session["student_id"])
        if blocked:
            return AIResult(reply, False, self._log_skip(session, config, purpose, blocked))

        ctx, solution, visible = self._context(session, reply, purpose)
        params = config["parameters"]
        started = time.monotonic()
        try:
            call = self.tutor.generate(ctx, model=config["model_name"],
                                       system_prompt=self.content.prompt(config["prompt_version"]),
                                       timeout=self.s.ai_timeout_seconds,
                                       max_output_tokens=int(params.get("max_output_tokens", 300)))
        except TutorAIError as exc:
            outcome = "fallback_timeout" if exc.kind == "timeout" else "fallback_error"
            self._log(session=session, config=config, purpose=purpose, outcome=outcome,
                      latency_ms=int((time.monotonic() - started) * 1000), detail=f"{exc.kind}:{exc}")
            return AIResult(reply, False, outcome)
        latency = int((time.monotonic() - started) * 1000)
        cost = (call.input_tokens * float(params.get("price_input_per_mtok", 0))
                + call.output_tokens * float(params.get("price_output_per_mtok", 0))) / 1_000_000
        violations = check_output(call.output, ctx, solution=solution, visible_context=visible)
        if violations:
            self._log(session=session, config=config, purpose=purpose, outcome="fallback_invalid",
                      input_tokens=call.input_tokens, output_tokens=call.output_tokens, cost=cost,
                      latency_ms=latency, detail=",".join(violations))
            return AIResult(reply, False, "fallback_invalid")
        current_version = self.conn.execute("SELECT version FROM learning_sessions WHERE id=?",
                                            (session["id"],)).fetchone()[0]
        if current_version != reply.session_version:
            self._log(session=session, config=config, purpose=purpose, outcome="skipped_stale",
                      input_tokens=call.input_tokens, output_tokens=call.output_tokens, cost=cost, latency_ms=latency)
            return AIResult(reply, False, "skipped_stale")
        out = call.output
        text = f"{out.feedback} {out.question}".strip()
        mid = self._log(session=session, config=config, purpose=purpose, outcome="ok",
                        input_tokens=call.input_tokens, output_tokens=call.output_tokens, cost=cost,
                        latency_ms=latency, message=("assistant", envelope(
                            text, kind="ai_feedback", purpose=str(purpose), step_id=reply.step_id,
                            hint_level=reply.hint_level, needs_teacher_review=out.needs_teacher_review)))
        if purpose == Purpose.HINT:
            new_reply = replace(reply, hint=out.feedback, question=out.question)
        else:
            new_reply = replace(reply, feedback=out.feedback, question=out.question)
        if out.needs_teacher_review:
            new_reply = replace(new_reply, needs_teacher=True)
        return AIResult(new_reply, True, "ok", mid)

    def _log_skip(self, session: dict, config: dict | None, purpose: Purpose, outcome: str) -> str:
        self._log(session=session, config=config, purpose=purpose, outcome=outcome)
        return outcome

    def _context(self, session: dict, reply: TutorReply, purpose: Purpose):
        pv = self.conn.execute("SELECT statement, math_spec FROM problem_versions WHERE problem_id=? AND version=?",
                               (session["problem_id"], session["problem_version"])).fetchone()
        spec = json.loads(pv["math_spec"])
        original = f"{spec['lhs']}={spec['rhs']}"
        kind, value = Equation.parse(original).solution()
        solution = value if kind == SolutionKind.SINGLE else None
        step = row(self.conn.execute("SELECT * FROM solution_steps WHERE id=?", (reply.step_id,)).fetchone()) \
            if reply.step_id else None
        base = self.conn.execute(
            "SELECT submitted_equation FROM solution_steps WHERE session_id=? AND math_status='valid'"
            " AND operation NOT IN ('verify_substitution','conclude') ORDER BY step_index DESC LIMIT 1",
            (session["id"],)).fetchone()
        current = base[0] if base else original
        # Only whitelisted-parsed math leaves the server; 'unknown' input may contain free text.
        submitted = step["submitted_equation"] if step and step["math_status"] != "unknown" else None
        ctx = TutorContext(
            purpose=purpose, state=reply.state, problem_statement=pv["statement"], current_equation=current,
            submitted_equation=submitted, operation=step["operation"] if step else None,
            math_status=reply.math_status, error_code=reply.error_code,
            allowed_hint_level=reply.hint_level if purpose == Purpose.HINT else 0,
            template_feedback=reply.feedback, template_question=reply.question,
            template_hint=reply.hint if purpose == Purpose.HINT else None)
        visible = " ".join([pv["statement"], original, current, step["submitted_equation"] if step else ""])
        return ctx, solution, visible
