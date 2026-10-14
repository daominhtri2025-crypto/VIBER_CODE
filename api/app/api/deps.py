"""Request-scoped dependencies: DB connection, authenticated actor, role guards."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from collections.abc import Callable, Iterator
from dataclasses import dataclass

from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from app.application.auth_service import Actor, AuthService
from app.config import Settings
from app.domain.constants import Role
from app.domain.errors import IdempotencyConflict, PermissionDenied
from app.domain.tutor_ai import TutorAI
from app.infrastructure.auth import AuthError, GoogleIdTokenVerifier
from app.infrastructure.content_store import ContentStore
from app.infrastructure.sqlite.connection import connect, transaction


@dataclass
class AppContext:
    settings: Settings
    content: ContentStore
    tutor: TutorAI | None
    google: GoogleIdTokenVerifier | None


def ctx(request: Request) -> AppContext:
    return request.app.state.ctx


def db(request: Request) -> Iterator[sqlite3.Connection]:
    conn = connect(request.app.state.ctx.settings.db_path, check_same_thread=False)
    try:
        yield conn
    finally:
        conn.close()


def auth_service(conn: sqlite3.Connection = Depends(db), c: AppContext = Depends(ctx)) -> AuthService:
    return AuthService(conn, c.settings, c.google)


def current_actor(request: Request, auth: AuthService = Depends(auth_service)) -> Actor:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthError("Missing bearer token")
    return auth.actor_from_access_token(token.strip())


def require(*roles: Role) -> Callable[[Actor], Actor]:
    """Role gate (ANY of the roles). Resource-level checks still happen in services."""
    def guard(actor: Actor = Depends(current_actor)) -> Actor:
        if not any(actor.has(r) for r in roles):
            raise PermissionDenied("Insufficient role")
        return actor
    return guard


# ------------------------------------------------------------- idempotency
def _hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def idempotent(conn: sqlite3.Connection, *, actor_id: str, route: str, request_id: str, payload: dict,
               run: Callable[[], dict], status_code: int = 200) -> JSONResponse:
    """Replay the stored body for the same (actor, route, request_id, payload).

    Stored AFTER success only, so failed attempts are retried for real. This is
    what makes AI-phrased replies stable across client retries (decision D2).
    """
    h = _hash(payload)
    prior = conn.execute("SELECT payload_hash, status_code, response FROM request_results"
                         " WHERE actor_id=? AND route=? AND request_id=?", (actor_id, route, request_id)).fetchone()
    if prior is not None:
        if prior["payload_hash"] != h:
            raise IdempotencyConflict("request_id reused with a different payload")
        return JSONResponse(json.loads(prior["response"]), status_code=prior["status_code"],
                            headers={"Idempotent-Replay": "true"})
    body = run()
    with transaction(conn):
        conn.execute("INSERT OR IGNORE INTO request_results(actor_id, route, request_id, payload_hash, status_code,"
                     " response) VALUES(?,?,?,?,?,?)",
                     (actor_id, route, request_id, h, status_code, json.dumps(body, ensure_ascii=False, default=str)))
    return JSONResponse(json.loads(json.dumps(body, default=str)), status_code=status_code)
