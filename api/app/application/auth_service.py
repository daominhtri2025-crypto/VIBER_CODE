"""Hybrid authentication use-cases (decision 14/10/2026).

* Local accounts: created by teacher/admin with username + initial password.
* Google: ONLY logs into an existing, active account — matched by an existing
  linked identity, or by the account's pre-registered email (first login links
  it). Unknown Google users are rejected; nothing is auto-provisioned.
* Errors are generic (no account enumeration); lockout after repeated failures.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.domain.constants import Role
from app.domain.errors import IntegrityViolation, NotFound, PermissionDenied, ValidationFailed
from app.infrastructure.auth import (
    AuthError, GoogleIdTokenVerifier, decode_access_token, hash_password, hash_refresh_token,
    issue_access_token, needs_rehash, new_refresh_token, verify_password,
)
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import (
    audit, iso, new_id, parse_iso, require_active_role, require_text, row, user_roles,
)

GENERIC_LOGIN_ERROR = "Tên đăng nhập hoặc mật khẩu không đúng"


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"


@dataclass(frozen=True)
class Actor:
    """Authenticated caller resolved from the token on EVERY request."""
    id: str
    roles: frozenset[str]
    display_name: str

    def has(self, role: Role | str) -> bool:
        return str(role) in self.roles


class AuthService:
    def __init__(self, conn: sqlite3.Connection, settings: Settings,
                 google: GoogleIdTokenVerifier | None = None, clock=lambda: datetime.now(timezone.utc)):
        self.conn = conn
        self.s = settings
        self.google = google
        self.clock = clock

    # ------------------------------------------------------------ accounts
    def create_account(self, *, actor_id: str, display_name: str, roles: list[str], username: str,
                       initial_password: str, email: str | None = None) -> dict:
        """Admin creates any account; a teacher may create student accounts only."""
        actor_roles = user_roles(self.conn, actor_id)
        require_active_role(self.conn, actor_id)
        if Role.ADMIN not in actor_roles and not (Role.TEACHER in actor_roles and set(roles) == {"student"}):
            raise PermissionDenied("Not allowed to create this account")
        username = require_text("username", username, max_len=64).lower()
        try:
            pw_hash = hash_password(initial_password)
        except ValueError as exc:
            raise ValidationFailed(str(exc)) from exc
        uid = new_id()
        with transaction(self.conn):
            self.conn.execute("INSERT INTO users(id, display_name, email, auth_subject) VALUES(?,?,?,?)",
                              (uid, require_text("display_name", display_name, max_len=120),
                               email.strip().lower() if email else None, f"local:{uid}"))
            self.conn.executemany("INSERT INTO user_roles(user_id, role_code) VALUES(?,?)", [(uid, r) for r in roles])
            self.conn.execute("INSERT INTO user_credentials(user_id, username, password_hash) VALUES(?,?,?)",
                              (uid, username, pw_hash))
            audit(self.conn, actor_id=actor_id, action="account.create", entity_type="user", entity_id=uid,
                  details={"roles": sorted(roles), "has_email": bool(email)})
        return {"id": uid, "username": username, "roles": sorted(roles)}

    def change_password(self, *, user_id: str, old_password: str, new_password: str) -> None:
        cred = self.conn.execute("SELECT * FROM user_credentials WHERE user_id=?", (user_id,)).fetchone()
        if cred is None or not verify_password(cred["password_hash"], old_password):
            raise AuthError(GENERIC_LOGIN_ERROR)
        try:
            new_hash = hash_password(new_password)
        except ValueError as exc:
            raise ValidationFailed(str(exc)) from exc
        with transaction(self.conn):
            self.conn.execute("UPDATE user_credentials SET password_hash=?, must_change_password=0, updated_at=?"
                              " WHERE user_id=?", (new_hash, iso(self.clock()), user_id))
            self.conn.execute("UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
                              (iso(self.clock()), user_id))
            audit(self.conn, actor_id=user_id, action="account.change_password", entity_type="user", entity_id=user_id)

    # --------------------------------------------------------------- login
    def login(self, *, username: str, password: str) -> TokenPair:
        now = self.clock()
        cred = row(self.conn.execute(
            "SELECT c.*, u.status FROM user_credentials c JOIN users u ON u.id=c.user_id WHERE c.username=?",
            ((username or "").strip().lower(),)).fetchone())
        ok = verify_password(cred["password_hash"] if cred else None, password or "")
        if cred is None:
            raise AuthError(GENERIC_LOGIN_ERROR)
        if cred["locked_until"] and parse_iso(cred["locked_until"]) > now:
            raise AuthError(GENERIC_LOGIN_ERROR)  # locked: same generic message
        if not ok:
            with transaction(self.conn):
                fails = cred["failed_attempts"] + 1
                locked = iso(now + timedelta(seconds=self.s.lockout_seconds)) \
                    if fails >= self.s.max_failed_logins else None
                self.conn.execute("UPDATE user_credentials SET failed_attempts=?, locked_until=? WHERE user_id=?",
                                  (0 if locked else fails, locked, cred["user_id"]))
                if locked:
                    audit(self.conn, actor_id=None, action="account.locked", entity_type="user",
                          entity_id=cred["user_id"])
            raise AuthError(GENERIC_LOGIN_ERROR)
        if cred["status"] != "active":
            raise AuthError(GENERIC_LOGIN_ERROR)
        with transaction(self.conn):
            new_hash = hash_password(password) if needs_rehash(cred["password_hash"]) else cred["password_hash"]
            self.conn.execute("UPDATE user_credentials SET failed_attempts=0, locked_until=NULL, password_hash=?"
                              " WHERE user_id=?", (new_hash, cred["user_id"]))
        return self._issue(cred["user_id"], family_id=None)

    def google_login(self, *, id_token: str) -> TokenPair:
        identity = self._verify_google(id_token)
        with transaction(self.conn):
            linked = self.conn.execute("SELECT user_id FROM user_identities WHERE provider='google' AND subject=?",
                                       (identity.subject,)).fetchone()
            if linked is not None:
                user_id = linked[0]
            else:
                u = self.conn.execute("SELECT id FROM users WHERE email=?", (identity.email,)).fetchone()
                if u is None:
                    raise AuthError("Tài khoản Google này chưa được liên kết với tài khoản nào trong hệ thống")
                user_id = u[0]
                try:
                    self.conn.execute("INSERT INTO user_identities(provider, subject, user_id, email)"
                                      " VALUES('google',?,?,?)", (identity.subject, user_id, identity.email))
                except sqlite3.IntegrityError as exc:  # account already linked to a DIFFERENT Google subject
                    raise AuthError("Tài khoản đã liên kết với một tài khoản Google khác") from exc
                audit(self.conn, actor_id=user_id, action="account.link_google", entity_type="user",
                      entity_id=user_id, details={"via": "pre_registered_email"})
        self._require_active(user_id)
        return self._issue(user_id, family_id=None)

    def link_google(self, *, user_id: str, id_token: str) -> None:
        """Explicit link while logged in (email need not match)."""
        identity = self._verify_google(id_token)
        try:
            with transaction(self.conn):
                self.conn.execute("INSERT INTO user_identities(provider, subject, user_id, email) VALUES('google',?,?,?)",
                                  (identity.subject, user_id, identity.email))
                audit(self.conn, actor_id=user_id, action="account.link_google", entity_type="user",
                      entity_id=user_id, details={"via": "explicit"})
        except IntegrityViolation as exc:
            raise ValidationFailed("Google account or user already linked") from exc

    def _verify_google(self, id_token: str):
        if self.google is None:
            raise AuthError("Google login is not configured")
        return self.google.verify(id_token)

    # ------------------------------------------------------------- refresh
    def refresh(self, *, refresh_token: str) -> TokenPair:
        now = self.clock()
        r = self.conn.execute("SELECT * FROM refresh_tokens WHERE token_hash=?",
                              (hash_refresh_token(refresh_token or ""),)).fetchone()
        if r is None:
            raise AuthError("Invalid refresh token")
        if r["revoked_at"] is not None:
            # Reuse of a rotated/revoked token: assume theft, kill the whole family.
            with transaction(self.conn):
                self.conn.execute("UPDATE refresh_tokens SET revoked_at=coalesce(revoked_at, ?) WHERE family_id=?",
                                  (iso(now), r["family_id"]))
                audit(self.conn, actor_id=r["user_id"], action="auth.refresh_reuse", entity_type="user",
                      entity_id=r["user_id"])
            raise AuthError("Invalid refresh token")
        if parse_iso(r["expires_at"]) <= now:
            raise AuthError("Refresh token expired")
        self._require_active(r["user_id"])
        pair = self._issue(r["user_id"], family_id=r["family_id"], rotate_from=r["id"])
        return pair

    def logout(self, *, refresh_token: str) -> None:
        r = self.conn.execute("SELECT family_id FROM refresh_tokens WHERE token_hash=?",
                              (hash_refresh_token(refresh_token or ""),)).fetchone()
        if r is not None:
            with transaction(self.conn):
                self.conn.execute("UPDATE refresh_tokens SET revoked_at=coalesce(revoked_at, ?) WHERE family_id=?",
                                  (iso(self.clock()), r["family_id"]))

    def _issue(self, user_id: str, *, family_id: str | None, rotate_from: str | None = None) -> TokenPair:
        now = self.clock()
        token, token_hash = new_refresh_token()
        rid = new_id()
        with transaction(self.conn):
            self.conn.execute("INSERT INTO refresh_tokens(id, user_id, family_id, token_hash, issued_at, expires_at)"
                              " VALUES(?,?,?,?,?,?)",
                              (rid, user_id, family_id or new_id(), token_hash, iso(now),
                               iso(now + timedelta(seconds=self.s.refresh_ttl_seconds))))
            if rotate_from is not None:
                cur = self.conn.execute("UPDATE refresh_tokens SET revoked_at=?, replaced_by=? WHERE id=?"
                                        " AND revoked_at IS NULL", (iso(now), rid, rotate_from))
                if cur.rowcount != 1:  # concurrent rotation of the same token
                    raise AuthError("Invalid refresh token")
        access = issue_access_token(user_id, secret=self.s.jwt_secret, issuer=self.s.jwt_issuer,
                                    ttl_seconds=self.s.access_ttl_seconds, now=now)
        return TokenPair(access, token, self.s.access_ttl_seconds)

    # -------------------------------------------------------------- actors
    def _require_active(self, user_id: str) -> None:
        u = self.conn.execute("SELECT status FROM users WHERE id=?", (user_id,)).fetchone()
        if u is None or u["status"] != "active":
            raise AuthError("Account is not active")

    def actor_from_access_token(self, token: str) -> Actor:
        user_id = decode_access_token(token, secret=self.s.jwt_secret, issuer=self.s.jwt_issuer)
        u = self.conn.execute("SELECT id, display_name, status FROM users WHERE id=?", (user_id,)).fetchone()
        if u is None or u["status"] != "active":
            raise AuthError("Account is not active")
        return Actor(u["id"], frozenset(user_roles(self.conn, u["id"])), u["display_name"])

    def me(self, actor: Actor) -> dict:
        u = self.conn.execute("SELECT id, display_name, email FROM users WHERE id=?", (actor.id,)).fetchone()
        if u is None:
            raise NotFound("User not found")
        cred = self.conn.execute("SELECT username, must_change_password FROM user_credentials WHERE user_id=?",
                                 (actor.id,)).fetchone()
        google = self.conn.execute("SELECT 1 FROM user_identities WHERE provider='google' AND user_id=?",
                                   (actor.id,)).fetchone()
        return {"id": u["id"], "display_name": u["display_name"], "email": u["email"], "roles": sorted(actor.roles),
                "username": cred["username"] if cred else None,
                "must_change_password": bool(cred["must_change_password"]) if cred else False,
                "google_linked": google is not None}
