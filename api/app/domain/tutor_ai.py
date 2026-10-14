"""TutorAI port (handoff §6.4) and the output guard.

The domain owns the contract; providers live in ``infrastructure/ai``.
AI only *phrases* feedback — it never decides correctness, state, hint level
or scores, and its output is discarded unless it passes :func:`check_output`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from fractions import Fraction
from typing import Protocol

from app.domain.learning.leak_guard import leaks_answer

MAX_FIELD_LEN = 300


class Purpose(StrEnum):
    STEP_FEEDBACK = "step_feedback"
    HINT = "hint"
    VERIFY_FEEDBACK = "verify_feedback"


@dataclass(frozen=True)
class TutorContext:
    """Everything the model may see. Deliberately PII-free: no names, ids, or
    free-text written by the student (only whitelisted-parsed math)."""
    purpose: Purpose
    state: str
    problem_statement: str
    current_equation: str
    submitted_equation: str | None
    operation: str | None
    math_status: str | None
    error_code: str | None
    allowed_hint_level: int          # 0 = no hint in this turn
    template_feedback: str           # teacher-approved fallback, also a style anchor
    template_question: str
    template_hint: str | None = None


@dataclass(frozen=True)
class TutorOutput:
    feedback: str
    question: str
    hint_level: int
    needs_teacher_review: bool


@dataclass(frozen=True)
class TutorCall:
    output: TutorOutput
    input_tokens: int
    output_tokens: int


class TutorAIError(Exception):
    def __init__(self, kind: str, message: str = ""):
        super().__init__(message or kind)
        self.kind = kind  # "timeout" | "transport" | "bad_output" | "refusal"


class TutorAI(Protocol):
    provider: str

    def generate(self, ctx: TutorContext, *, model: str, system_prompt: str, timeout: float,
                 max_output_tokens: int) -> TutorCall: ...


OUTPUT_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "feedback": {"type": "string"},
        "question": {"type": "string"},
        "hint_level": {"type": "integer"},
        "needs_teacher_review": {"type": "boolean"},
    },
    "required": ["feedback", "question", "hint_level", "needs_teacher_review"],
    "additionalProperties": False,
}

# Verdict phrases. "Hướng làm đúng" (right approach, wrong arithmetic) is NOT a verdict on the step.
_AFFIRM = re.compile(r"(?i)\b(đúng rồi|chính xác|hoàn toàn đúng|em làm đúng|bước (?:này|biến đổi này) đúng"
                     r"|kết quả đúng|tuyệt vời|giỏi lắm)\b")
_NEGATE = re.compile(r"(?i)\b(sai|chưa đúng|không đúng|nhầm)\b")
_CONTACT = re.compile(r"(?i)(https?://|www\.|[\w.+-]+@[\w-]+\.\w+|\b\d{9,11}\b)")


def check_output(out: TutorOutput, ctx: TutorContext, *, solution: Fraction | None,
                 visible_context: str) -> list[str]:
    """Return a list of violations (empty = acceptable). Schema validity alone
    proves nothing about content (handoff §6.4), so content is checked too."""
    problems: list[str] = []
    for name in ("feedback", "question"):
        text = getattr(out, name)
        if not isinstance(text, str) or not text.strip():
            problems.append(f"{name}_empty")
        elif len(text) > MAX_FIELD_LEN:
            problems.append(f"{name}_too_long")
    if problems:
        return problems
    text = f"{out.feedback} {out.question}"
    if not isinstance(out.hint_level, int) or not 0 <= out.hint_level <= ctx.allowed_hint_level:
        problems.append("hint_level_exceeds_policy")
    if out.question.count("?") > 1:
        problems.append("more_than_one_question")
    if leaks_answer(text, solution, visible_context):
        problems.append("answer_leak")
    if ctx.math_status in ("invalid", "unknown") and _AFFIRM.search(text):
        problems.append("contradicts_mathchecker_affirms")
    if ctx.math_status == "valid" and _NEGATE.search(out.feedback):
        problems.append("contradicts_mathchecker_negates")
    if _CONTACT.search(text):
        problems.append("contact_or_link")
    return problems
