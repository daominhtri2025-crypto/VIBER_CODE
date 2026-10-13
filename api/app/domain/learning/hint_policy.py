"""HintPolicy (decision Q8) — pure function of the interaction history in one scope.

Scope = one solving step (``SOLVE_STEP:<last valid step id | start>``) or one
scaffolding stage (``IDENTIFY_KNOWLEDGE``, ``PROPOSE_PLAN``, ``VERIFY_RESULT``).
Hint levels reset when the scope changes, i.e. after a valid step.

Rules
-----
1. No hints in independent mode or outside HINTABLE_STATES.
2. Student request: next level = previous max level in scope + 1 (max 3).
   A request after level 3 is denied and flags ``needs_teacher``.
3. System offer: after 2 consecutive failures since the last hint in scope
   (``unknown`` is not a failure), offer the next level.
4. After level 3 was given in scope, one more failure flags ``needs_teacher``
   (teacher support / easier problem), and no further offers are made.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.domain.constants import MAX_HINT_LEVEL, HintTrigger, LearningMode
from app.domain.learning.state_machine import HINTABLE_STATES

FAILURES_BEFORE_OFFER = 2


class Kind(StrEnum):
    ATTEMPT = "attempt"
    HINT = "hint"


@dataclass(frozen=True)
class ScopeEvent:
    """One interaction in a scope, in chronological order."""
    kind: Kind
    failed: bool = False   # for attempts: invalid / rejected (unknown is NOT a failure)
    level: int = 0         # for hints


@dataclass(frozen=True)
class HintDecision:
    allowed: bool
    level: int = 0
    trigger: HintTrigger | None = None
    needs_teacher: bool = False
    reason: str = ""


def _summary(history: list[ScopeEvent]) -> tuple[int, int, int | None]:
    """(max level given, failures since last hint, failures since level 3 — None if L3 not given)."""
    max_level, since_hint, since_max = 0, 0, None
    for ev in history:
        if ev.kind == Kind.HINT:
            max_level = max(max_level, ev.level)
            since_hint = 0
            if ev.level >= MAX_HINT_LEVEL:
                since_max = 0
        elif ev.failed:
            since_hint += 1
            if since_max is not None:
                since_max += 1
    return max_level, since_hint, since_max


def _blocked(mode: str, state: str) -> bool:
    return mode == LearningMode.INDEPENDENT or state not in HINTABLE_STATES


def on_request(mode: str, state: str, history: list[ScopeEvent]) -> HintDecision:
    if _blocked(mode, state):
        return HintDecision(False, reason="blocked")
    max_level, _, _ = _summary(history)
    if max_level >= MAX_HINT_LEVEL:
        return HintDecision(False, needs_teacher=True, reason="max_level")
    return HintDecision(True, max_level + 1, HintTrigger.STUDENT_REQUEST)


def after_attempt(mode: str, state: str, history: list[ScopeEvent]) -> HintDecision:
    """Call with history INCLUDING the attempt just made."""
    if _blocked(mode, state):
        return HintDecision(False, reason="blocked")
    max_level, since_hint, since_max = _summary(history)
    if since_max is not None and since_max >= 1:
        return HintDecision(False, needs_teacher=True, reason="max_level_then_failed")
    if since_hint >= FAILURES_BEFORE_OFFER and max_level < MAX_HINT_LEVEL:
        return HintDecision(True, max_level + 1, HintTrigger.SYSTEM_OFFER)
    return HintDecision(False, reason="not_needed")
