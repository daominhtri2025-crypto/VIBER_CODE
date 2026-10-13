"""LearningStateMachine — explicit transition table (handoff §5.1).

Only the service may drive transitions, and only from events it derived
itself (MathChecker results, catalogue checks) — never because a client or an
AI asked for a state (acceptance: "Không chuyển state chỉ vì AI/nội dung
client yêu cầu").

Mode differences
----------------
* guided      : READ_PROBLEM → IDENTIFY_KNOWLEDGE → PROPOSE_PLAN → SOLVE_STEP
                → VERIFY_RESULT → INDEPENDENT_PRACTICE → COMPLETED
* practice    : starts at SOLVE_STEP (no knowledge/plan scaffolding), then as guided.
* independent : starts at SOLVE_STEP; reaching a final form does NOT move the
                state (that would leak correctness); only SUBMIT → COMPLETED.
"""
from __future__ import annotations

from enum import StrEnum

from app.domain.constants import LearningMode as M
from app.domain.constants import SessionState as S
from app.domain.errors import StateConflict


class Event(StrEnum):
    PROBLEM_READ = "problem_read"
    KNOWLEDGE_ACCEPTED = "knowledge_accepted"
    PLAN_ACCEPTED = "plan_accepted"
    FINAL_FORM_REACHED = "final_form_reached"
    VERIFIED = "verified"
    INDEPENDENT_SUBMITTED = "independent_submitted"
    PRACTICE_FINISHED = "practice_finished"  # parent closes when its child is submitted


_GUIDED_LIKE = (M.GUIDED, M.PRACTICE)

# (mode, from_state, event) -> to_state
TRANSITIONS: dict[tuple[M, S, Event], S] = {
    (M.GUIDED, S.READ_PROBLEM, Event.PROBLEM_READ): S.IDENTIFY_KNOWLEDGE,
    (M.GUIDED, S.IDENTIFY_KNOWLEDGE, Event.KNOWLEDGE_ACCEPTED): S.PROPOSE_PLAN,
    (M.GUIDED, S.PROPOSE_PLAN, Event.PLAN_ACCEPTED): S.SOLVE_STEP,
    **{(m, S.SOLVE_STEP, Event.FINAL_FORM_REACHED): S.VERIFY_RESULT for m in _GUIDED_LIKE},
    **{(m, S.VERIFY_RESULT, Event.VERIFIED): S.INDEPENDENT_PRACTICE for m in _GUIDED_LIKE},
    **{(m, S.INDEPENDENT_PRACTICE, Event.PRACTICE_FINISHED): S.COMPLETED for m in _GUIDED_LIKE},
    (M.INDEPENDENT, S.SOLVE_STEP, Event.INDEPENDENT_SUBMITTED): S.COMPLETED,
}

INITIAL_STATE = {M.GUIDED: S.READ_PROBLEM, M.PRACTICE: S.SOLVE_STEP, M.INDEPENDENT: S.SOLVE_STEP}

HINTABLE_STATES = frozenset({S.IDENTIFY_KNOWLEDGE, S.PROPOSE_PLAN, S.SOLVE_STEP, S.VERIFY_RESULT})


def initial_state(mode: str) -> S:
    return INITIAL_STATE[M(mode)]


def next_state(mode: str, state: str, event: Event) -> S:
    try:
        return TRANSITIONS[(M(mode), S(state), event)]
    except (KeyError, ValueError):
        raise StateConflict(f"Transition '{event}' is not allowed from {state} in {mode} mode",
                            detail={"mode": mode, "state": state, "event": str(event)}) from None


def can(mode: str, state: str, event: Event) -> bool:
    return (M(mode), S(state), event) in TRANSITIONS


def require_state(state: str, *allowed: S) -> None:
    if S(state) not in allowed:
        raise StateConflict(f"Action not allowed in state {state}",
                            detail={"state": state, "allowed": [str(a) for a in allowed]})
