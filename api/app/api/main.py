"""FastAPI application factory.

Run (development):
    cd api && APP_DB_PATH=data/app.db JWT_SECRET=... uvicorn app.api.main:app --reload

Uniform error contract (handoff §6.1): 401 unauthenticated, 403 forbidden,
404 not found/not visible, 409 version/state/request conflict, 422 invalid
input. A math ``unknown`` is a normal 200 business result, not an error.
"""
from __future__ import annotations

import logging
import sqlite3
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.deps import AppContext
from app.api.routers import admin, auth, listing, research, student, teacher
from app.config import Settings
from app.domain.errors import (
    DomainError, IdempotencyConflict, IntegrityViolation, NotFound, PermissionDenied, StateConflict,
    ValidationFailed, VersionConflict,
)
from app.domain.tutor_ai import TutorAI
from app.infrastructure.auth import AuthError, GoogleIdTokenVerifier
from app.infrastructure.content_store import ContentStore

log = logging.getLogger("math_tutor.api")

STATUS = {AuthError: 401, PermissionDenied: 403, NotFound: 404, VersionConflict: 409, StateConflict: 409,
          IdempotencyConflict: 409, IntegrityViolation: 409, ValidationFailed: 422}


def create_app(settings: Settings | None = None, *, tutor: TutorAI | None = None,
               google: GoogleIdTokenVerifier | None = None, content: ContentStore | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    if tutor is None and settings.ai_enabled and settings.ai_provider == "mock":
        from app.infrastructure.ai.mock import MockTutorAI
        tutor = MockTutorAI()
    elif tutor is None and settings.ai_enabled and settings.anthropic_api_key:
        from app.infrastructure.ai.claude import ClaudeTutorAI
        tutor = ClaudeTutorAI(settings.anthropic_api_key)
    if google is None and settings.google_client_id:
        google = GoogleIdTokenVerifier(settings.google_client_id, allowed_domains=settings.google_allowed_domains)

    app = FastAPI(title="Trợ lý AI học Toán THCS — API", version="0.3.0")
    app.state.ctx = AppContext(settings=settings, content=content or ContentStore(), tutor=tutor, google=google)
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_credentials=False,
                           allow_methods=["*"], allow_headers=["Authorization", "Content-Type"])

    @app.middleware("http")
    async def request_id_header(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, exc: DomainError):
        status = next((code for cls, code in STATUS.items() if isinstance(exc, cls)), 400)
        body = {"error": exc.code, "message": exc.message}
        if status != 401 and exc.detail:
            body["detail"] = exc.detail
        return JSONResponse(body, status_code=status,
                            headers={"WWW-Authenticate": "Bearer"} if status == 401 else None)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse({"error": "VALIDATION_FAILED", "message": "Invalid request",
                             "detail": [{"loc": e["loc"], "msg": e["msg"]} for e in exc.errors()]}, status_code=422)

    @app.exception_handler(sqlite3.OperationalError)
    async def db_busy(request: Request, exc: sqlite3.OperationalError):
        if "locked" in str(exc) or "busy" in str(exc):
            return JSONResponse({"error": "BUSY", "message": "Server busy, retry with the same request_id"},
                                status_code=503, headers={"Retry-After": "1"})
        log.exception("database error")  # no user data in logs
        return JSONResponse({"error": "INTERNAL", "message": "Internal error"}, status_code=500)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    for r in (auth.router, listing.router, student.router, teacher.router, research.router, admin.router):
        app.include_router(r, prefix="/api/v1")
    return app


def _lazy_app() -> FastAPI:  # pragma: no cover - production entry point
    s = Settings.from_env()
    s.validate_for_production()
    return create_app(s)


def __getattr__(name: str):  # `uvicorn app.api.main:app` builds the app on first access
    if name == "app":
        return _lazy_app()
    raise AttributeError(name)
