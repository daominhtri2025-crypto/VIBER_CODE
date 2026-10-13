"""Helpers shared by SQLite repositories."""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from app.domain.errors import NotFound, PermissionDenied, ValidationFailed

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    """ISO-8601 UTC with milliseconds, matching the schema default format."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def new_id() -> str:
    return str(uuid.uuid4())


def row(r: sqlite3.Row | None) -> dict | None:
    return dict(r) if r is not None else None


def rows(rs) -> list[dict]:
    return [dict(r) for r in rs]


def require_text(name: str, value: Any, *, max_len: int, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise ValidationFailed(f"{name} must be a string")
    value = value.strip()
    if not value and not allow_empty:
        raise ValidationFailed(f"{name} must not be empty")
    if len(value) > max_len:
        raise ValidationFailed(f"{name} exceeds {max_len} characters")
    return value


def dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def user_roles(conn: sqlite3.Connection, user_id: str) -> set[str]:
    return {r[0] for r in conn.execute("SELECT role_code FROM user_roles WHERE user_id=?", (user_id,))}


def require_active_role(conn: sqlite3.Connection, user_id: str, *roles: str) -> None:
    """Actor must exist, be active and hold ALL listed roles."""
    u = conn.execute("SELECT status FROM users WHERE id=?", (user_id,)).fetchone()
    if u is None:
        raise NotFound("User not found")
    if u["status"] != "active":
        raise PermissionDenied("User is disabled")
    missing = set(roles) - user_roles(conn, user_id)
    if missing:
        raise PermissionDenied(f"Missing role(s): {', '.join(sorted(missing))}")


def audit(conn: sqlite3.Connection, *, actor_id: str | None, action: str, entity_type: str,
          entity_id: str, request_id: str | None = None, details: dict | None = None) -> None:
    """Append an audit row. Must be called INSIDE the caller's transaction."""
    if not conn.in_transaction:
        raise RuntimeError("audit() must run inside the mutation's transaction")
    conn.execute(
        "INSERT INTO audit_log(id, actor_id, action, entity_type, entity_id, request_id, details)"
        " VALUES(?,?,?,?,?,?,?)",
        (new_id(), actor_id, action, entity_type, entity_id, request_id, dumps(details or {})),
    )


def envelope(text: str, **meta: Any) -> str:
    """messages.content format v1: {"v":1,"text":...,"meta":{...}} (legacy rows are plain text)."""
    return dumps({"v": 1, "text": text, "meta": meta})
