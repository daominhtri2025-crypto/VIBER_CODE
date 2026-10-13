"""SQLite repositories (trusted backend code; callers pass the authenticated actor id)."""
from app.infrastructure.sqlite.repositories.assessments import AssessmentRepository
from app.infrastructure.sqlite.repositories.assignments import AssignmentRepository
from app.infrastructure.sqlite.repositories.classes import ClassRepository
from app.infrastructure.sqlite.repositories.erasure import ErasureRepository
from app.infrastructure.sqlite.repositories.content import ContentRepository
from app.infrastructure.sqlite.repositories.hints import HintRepository
from app.infrastructure.sqlite.repositories.reports import ReportRepository
from app.infrastructure.sqlite.repositories.sessions import SessionRepository
from app.infrastructure.sqlite.repositories.users import UserRepository

__all__ = [
    "AssessmentRepository", "AssignmentRepository", "ClassRepository", "ContentRepository", "ErasureRepository",
    "HintRepository", "ReportRepository", "SessionRepository", "UserRepository",
]
