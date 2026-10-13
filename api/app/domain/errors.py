"""Domain-level error taxonomy.

Repositories and services raise these instead of raw ``sqlite3`` errors so the
API layer (Phase 3) can map them deterministically to HTTP status codes:

=====================  ======  =============================================
Error                  HTTP    Meaning
=====================  ======  =============================================
NotFound               404     Resource missing *or* not visible to caller
PermissionDenied       403     Authenticated but not authorised
VersionConflict        409     ``expected_version`` is stale
StateConflict          409     Operation not allowed in the current state
IdempotencyConflict    409     Same request_id reused with a different payload
ValidationFailed       422     Input violates a business/schema rule
IntegrityViolation     409     A database invariant (FK/CHECK/trigger) fired
=====================  ======  =============================================
"""
from __future__ import annotations


class DomainError(Exception):
    """Base class; ``code`` is a stable machine-readable identifier."""

    code = "DOMAIN_ERROR"

    def __init__(self, message: str = "", *, detail: dict | None = None):
        super().__init__(message or self.code)
        self.message = message or self.code
        self.detail = detail or {}


class NotFound(DomainError):
    code = "NOT_FOUND"


class PermissionDenied(DomainError):
    code = "PERMISSION_DENIED"


class VersionConflict(DomainError):
    code = "VERSION_CONFLICT"


class StateConflict(DomainError):
    code = "STATE_CONFLICT"


class IdempotencyConflict(DomainError):
    code = "IDEMPOTENCY_CONFLICT"


class ValidationFailed(DomainError):
    code = "VALIDATION_FAILED"


class IntegrityViolation(DomainError):
    code = "INTEGRITY_VIOLATION"
