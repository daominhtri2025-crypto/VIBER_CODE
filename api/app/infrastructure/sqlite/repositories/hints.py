"""Hint events (idempotent via ``request_id``, migration 0002).

Blocking is layered: this repository raises :class:`StateConflict` for
independent/INDEPENDENT_PRACTICE/COMPLETED sessions *before* the DB trigger
``block_independent_hints`` would fire, so the API returns a clean 409.

Retry semantics: the first committed hint for a ``request_id`` wins; a retry
with the same ``(trigger, step_id)`` returns it unchanged even if the AI would
now phrase it differently. A retry that changes trigger/step/level is an
:class:`IdempotencyConflict`. Services should call :meth:`get_by_request`
*before* computing a new hint level so a retry is never escalated.
"""
from __future__ import annotations

import sqlite3

from app.domain.constants import HINT_BLOCKED_STATES, MAX_HINT_LEVEL, HintTrigger, LearningMode, Role
from app.domain.errors import IdempotencyConflict, NotFound, StateConflict, ValidationFailed
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import new_id, require_active_role, require_text, row, rows


class HintRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_by_request(self, session_id: str, request_id: str) -> dict | None:
        return row(self.conn.execute("SELECT * FROM hint_events WHERE session_id=? AND request_id=?",
                                     (session_id, request_id)).fetchone())

    def list_for_session(self, session_id: str) -> list[dict]:
        return rows(self.conn.execute(
            "SELECT * FROM hint_events WHERE session_id=? ORDER BY created_at, rowid", (session_id,)))

    def highest_level(self, session_id: str, step_id: str | None = None) -> int:
        sql = "SELECT coalesce(max(hint_level),0) FROM hint_events WHERE session_id=?"
        args: tuple = (session_id,)
        if step_id is not None:
            sql += " AND step_id=?"
            args += (step_id,)
        return int(self.conn.execute(sql, args).fetchone()[0])

    def record(self, *, actor_id: str, session_id: str, request_id: str, hint_level: int,
               trigger: HintTrigger | str, content: str, step_id: str | None = None,
               scope: str | None = None, messages: list[tuple[str, str]] | None = None) -> dict:
        request_id = require_text("request_id", request_id, max_len=64)
        content = require_text("content", content, max_len=1000)
        if not (isinstance(hint_level, int) and 1 <= hint_level <= MAX_HINT_LEVEL):
            raise ValidationFailed(f"hint_level must be 1..{MAX_HINT_LEVEL}")
        if str(trigger) not in {t.value for t in HintTrigger}:
            raise ValidationFailed("trigger invalid")
        with transaction(self.conn):
            s = self.conn.execute("SELECT * FROM learning_sessions WHERE id=?", (session_id,)).fetchone()
            if s is None or s["student_id"] != actor_id:
                raise NotFound("Session not found")
            require_active_role(self.conn, actor_id, Role.STUDENT)
            prior = self.get_by_request(session_id, request_id)
            if prior is not None:
                if (prior["trigger"], prior["step_id"], prior["hint_level"]) != (str(trigger), step_id, hint_level):
                    raise IdempotencyConflict("request_id reused with a different hint request")
                return {**prior, "replayed": True}
            if s["learning_mode"] == LearningMode.INDEPENDENT or s["state"] in HINT_BLOCKED_STATES:
                raise StateConflict("Hints are disabled for this session")
            hid = new_id()
            self.conn.execute(
                "INSERT INTO hint_events(id, session_id, step_id, hint_level, trigger, content, request_id, scope)"
                " VALUES(?,?,?,?,?,?,?,?)",
                (hid, session_id, step_id, hint_level, str(trigger), content, request_id, scope))
            for sender, body in messages or ():
                self.conn.execute("INSERT INTO messages(id, session_id, sender_type, content) VALUES(?,?,?,?)",
                                  (new_id(), session_id, sender, body.replace("{hint_id}", hid)))
            h = dict(self.conn.execute("SELECT * FROM hint_events WHERE id=?", (hid,)).fetchone())
        return {**h, "replayed": False}
