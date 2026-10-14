"""Request DTOs. Note what is ABSENT: no actor_id, math_status, score source,
base equation or state from clients (handoff §6.2) — extra fields are rejected."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

RequestId = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---------------------------------------------------------------- auth
class LoginIn(Strict):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class GoogleIn(Strict):
    id_token: str = Field(min_length=10, max_length=4096)


class RefreshIn(Strict):
    refresh_token: str = Field(min_length=10, max_length=200)


class ChangePasswordIn(Strict):
    old_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


# ------------------------------------------------------------- student
class StartSessionIn(Strict):
    assignment_id: str = Field(min_length=1, max_length=64)
    problem_id: str = Field(min_length=1, max_length=64)
    problem_version: int = Field(ge=1)


class Versioned(Strict):
    request_id: str = RequestId
    expected_version: int = Field(ge=0)


class ReadIn(Versioned):
    restatement: str = Field(max_length=1000)


class ChoiceIn(Versioned):
    option_id: str = Field(min_length=1, max_length=64)
    explanation: str = Field(default="", max_length=2000)


class StepIn(Versioned):
    submitted_equation: str = Field(min_length=1, max_length=200)
    operation: str = Field(min_length=1, max_length=50)
    operation_value: str | None = Field(default=None, max_length=50)
    explanation: str = Field(default="", max_length=2000)


class HintIn(Strict):
    request_id: str = RequestId


class VerifyIn(Versioned):
    substitution: str | None = Field(default=None, max_length=200)
    conclusion: str | None = Field(default=None, pattern=r"^(no_solution|infinite_solutions)$")


class SubmitIn(Strict):
    expected_version: int = Field(ge=0)


class ActivityIn(Strict):
    event_type: str = Field(pattern=r"^(pause|resume|heartbeat)$")


class FeedbackReportIn(Strict):
    message_id: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=3, max_length=1000)


class ResponseIn(Strict):
    solution: str = Field(max_length=2000)
    explanation: str = Field(default="", max_length=2000)


# ------------------------------------------------------------- teacher
class ClassIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    school_year: str = Field(min_length=1, max_length=20)


class MemberIn(Strict):
    student_id: str = Field(min_length=1, max_length=64)


class ProblemIn(Strict):
    topic_id: str = Field(min_length=1, max_length=64)


class MathSpec(Strict):
    variable: str = Field(pattern=r"^x$")
    domain: str = Field(max_length=20)
    lhs: str = Field(min_length=1, max_length=200)
    rhs: str = Field(min_length=1, max_length=200)


class VersionIn(Strict):
    statement: str = Field(min_length=1, max_length=1000)
    math_spec: MathSpec
    teacher_solution: str = Field(min_length=1, max_length=4000)
    hints: list[str] = Field(min_length=3, max_length=3)
    difficulty: str = Field(pattern=r"^(easy|medium|hard)$")


class DraftPatchIn(Strict):
    statement: str | None = Field(default=None, max_length=1000)
    math_spec: MathSpec | None = None
    teacher_solution: str | None = Field(default=None, max_length=4000)
    hints: list[str] | None = Field(default=None, min_length=3, max_length=3)
    difficulty: str | None = Field(default=None, pattern=r"^(easy|medium|hard)$")


class AssignedProblem(Strict):
    problem_id: str
    problem_version: int = Field(ge=1)


class AssignmentIn(Strict):
    class_id: str
    title: str = Field(min_length=1, max_length=200)
    learning_mode: str = Field(pattern=r"^(guided|practice|independent)$")
    problems: list[AssignedProblem] = Field(min_length=1, max_length=50)
    due_at: datetime | None = None


class FeedbackResolveIn(Strict):
    status: str = Field(pattern=r"^(reviewing|resolved)$")
    resolution: str | None = Field(default=None, max_length=1000)


# ------------------------------------------------------------ research
class StudyIn(Strict):
    title: str = Field(min_length=1, max_length=200)
    start_at: datetime | None = None
    end_at: datetime | None = None


class ResearcherIn(Strict):
    researcher_id: str


class GroupIn(Strict):
    name: str = Field(min_length=1, max_length=100)
    condition: str = Field(pattern=r"^(ai_guided|comparison)$")


class ParticipantIn(Strict):
    student_id: str
    group_id: str


class ItemIn(Strict):
    problem_id: str
    problem_version: int = Field(ge=1)
    max_solution_score: float = Field(ge=0, le=100)
    max_explanation_score: float = Field(ge=0, le=100)


class AssessmentIn(Strict):
    title: str = Field(min_length=1, max_length=200)
    phase: str = Field(pattern=r"^(pre|post|retention)$")
    rubric_version: str = Field(min_length=1, max_length=50)
    items: list[ItemIn] = Field(min_length=1, max_length=50)
    opens_at: datetime | None = None
    closes_at: datetime | None = None


class GradeIn(Strict):
    solution_score: float = Field(ge=0)
    explanation_score: float = Field(ge=0)


class ErasureIn(Strict):
    subject_user_id: str
    reason: str = Field(min_length=5, max_length=1000)


# --------------------------------------------------------------- admin
class UserIn(Strict):
    display_name: str = Field(min_length=1, max_length=120)
    roles: list[str] = Field(min_length=1, max_length=4)
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    initial_password: str = Field(min_length=8, max_length=256)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class StatusIn(Strict):
    status: str = Field(pattern=r"^(active|disabled)$")


class RoleIn(Strict):
    role: str = Field(pattern=r"^(student|teacher|researcher|admin)$")
    grant: bool = True


class AIConfigIn(Strict):
    provider: str = Field(pattern=r"^(anthropic|mock)$")
    model_name: str = Field(min_length=1, max_length=100)
    prompt_version: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    parameters: dict = Field(default_factory=dict)
