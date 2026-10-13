"""Users and roles.

Identity is resolved from ``users.auth_subject`` (token subject) — never from
an ID supplied in a request body (handoff §2.2).
"""
from __future__ import annotations

import sqlite3

from app.domain.constants import Role
from app.domain.errors import NotFound, ValidationFailed
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import (
    audit, new_id, require_active_role, require_text, row, user_roles,
)


class UserRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    # ---- reads -----------------------------------------------------------
    def get(self, user_id: str) -> dict:
        u = row(self.conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
        if u is None:
            raise NotFound("User not found")
        u["roles"] = sorted(user_roles(self.conn, user_id))
        return u

    def resolve_actor(self, auth_subject: str) -> dict:
        """Map an authenticated subject to an *active* user with roles."""
        r = self.conn.execute("SELECT id FROM users WHERE auth_subject=?", (auth_subject,)).fetchone()
        if r is None:
            raise NotFound("Unknown subject")
        require_active_role(self.conn, r["id"])  # raises if disabled
        return self.get(r["id"])

    def has_role(self, user_id: str, role: Role | str) -> bool:
        return str(role) in user_roles(self.conn, user_id)

    # ---- mutations (admin use-cases; caller authorisation in Phase 3) -----
    def create(self, *, display_name: str, roles: list[Role | str], auth_subject: str | None = None,
               actor_id: str | None = None, user_id: str | None = None) -> dict:
        display_name = require_text("display_name", display_name, max_len=120)
        if not roles:
            raise ValidationFailed("At least one role is required")
        uid = user_id or new_id()
        with transaction(self.conn):
            self.conn.execute("INSERT INTO users(id, auth_subject, display_name) VALUES(?,?,?)",
                              (uid, auth_subject, display_name))
            self.conn.executemany("INSERT INTO user_roles(user_id, role_code) VALUES(?,?)",
                                  [(uid, str(r)) for r in roles])
            audit(self.conn, actor_id=actor_id, action="user.create", entity_type="user", entity_id=uid,
                  details={"roles": sorted(map(str, roles))})
        return self.get(uid)

    def set_status(self, user_id: str, status: str, *, actor_id: str) -> dict:
        if status not in ("active", "disabled"):
            raise ValidationFailed("status must be active|disabled")
        with transaction(self.conn):
            cur = self.conn.execute("UPDATE users SET status=? WHERE id=?", (status, user_id))
            if cur.rowcount == 0:
                raise NotFound("User not found")
            audit(self.conn, actor_id=actor_id, action="user.set_status", entity_type="user",
                  entity_id=user_id, details={"status": status})
        return self.get(user_id)

    def grant_role(self, user_id: str, role: Role | str, *, actor_id: str) -> None:
        with transaction(self.conn):
            self.conn.execute("INSERT OR IGNORE INTO user_roles(user_id, role_code) VALUES(?,?)", (user_id, str(role)))
            audit(self.conn, actor_id=actor_id, action="user.grant_role", entity_type="user",
                  entity_id=user_id, details={"role": str(role)})

    def revoke_role(self, user_id: str, role: Role | str, *, actor_id: str) -> None:
        with transaction(self.conn):
            self.conn.execute("DELETE FROM user_roles WHERE user_id=? AND role_code=?", (user_id, str(role)))
            audit(self.conn, actor_id=actor_id, action="user.revoke_role", entity_type="user",
                  entity_id=user_id, details={"role": str(role)})
