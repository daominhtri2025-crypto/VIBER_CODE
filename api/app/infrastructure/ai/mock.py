"""Deterministic TutorAI for tests and offline development (no API key needed)."""
from __future__ import annotations

import time
from collections.abc import Callable

from app.domain.tutor_ai import TutorAIError, TutorCall, TutorContext, TutorOutput


class MockTutorAI:
    provider = "mock"

    def __init__(self, behaviour: str | Callable[[TutorContext], TutorOutput] = "rephrase", *,
                 delay: float = 0.0):
        self.behaviour = behaviour
        self.delay = delay
        self.calls: list[TutorContext] = []

    def generate(self, ctx: TutorContext, *, model: str, system_prompt: str, timeout: float,
                 max_output_tokens: int) -> TutorCall:
        self.calls.append(ctx)
        if self.delay:
            time.sleep(min(self.delay, timeout))
            if self.delay >= timeout:
                raise TutorAIError("timeout")
        if callable(self.behaviour):
            return TutorCall(self.behaviour(ctx), 120, 40)
        if self.behaviour == "timeout":
            raise TutorAIError("timeout")
        if self.behaviour == "error":
            raise TutorAIError("transport", "HTTP 529")
        if self.behaviour == "garbage":
            raise TutorAIError("bad_output", "JSONDecodeError")
        base = ctx.template_hint or ctx.template_feedback
        return TutorCall(TutorOutput(feedback=f"[AI] {base}", question=ctx.template_question,
                                     hint_level=ctx.allowed_hint_level, needs_teacher_review=False), 120, 40)
