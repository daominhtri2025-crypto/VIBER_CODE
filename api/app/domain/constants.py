"""Enumerations mirrored from the SQLite CHECK constraints (schema v1/v2).

Kept as ``StrEnum`` so values compare equal to the raw TEXT stored in SQLite.
"""
from enum import StrEnum


class Role(StrEnum):
    STUDENT = "student"
    TEACHER = "teacher"
    RESEARCHER = "researcher"
    ADMIN = "admin"


class LearningMode(StrEnum):
    GUIDED = "guided"
    PRACTICE = "practice"
    INDEPENDENT = "independent"


class SessionState(StrEnum):
    READ_PROBLEM = "READ_PROBLEM"
    IDENTIFY_KNOWLEDGE = "IDENTIFY_KNOWLEDGE"
    PROPOSE_PLAN = "PROPOSE_PLAN"
    SOLVE_STEP = "SOLVE_STEP"
    VERIFY_RESULT = "VERIFY_RESULT"
    INDEPENDENT_PRACTICE = "INDEPENDENT_PRACTICE"
    COMPLETED = "COMPLETED"


class MathStatus(StrEnum):
    VALID = "valid"
    INVALID = "invalid"
    UNKNOWN = "unknown"


class HintTrigger(StrEnum):
    STUDENT_REQUEST = "student_request"
    SYSTEM_OFFER = "system_offer"


class Difficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


# States in which the DB trigger already blocks hints (schema v1).
HINT_BLOCKED_STATES = frozenset({SessionState.INDEPENDENT_PRACTICE, SessionState.COMPLETED})

MAX_HINT_LEVEL = 3
REQUIRED_MATH_SPEC_KEYS = frozenset({"variable", "domain", "lhs", "rhs"})
