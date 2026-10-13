"""Controlled hard deletion of one student's learning/assessment data (D5).

Two-person rule:
  1. ``request``  — an admin, or a researcher assigned to a study the subject
     participates in.
  2. ``approve`` / ``reject`` — an admin who is NOT the requester (also a DB CHECK).
  3. ``execute``  — an admin; deletes everything in one transaction.

Deleted: hint_events, solution_steps, messages (+ feedback_reports on them and
by the subject), activity_events, learning_sessions, item_responses,
assessment_attempts, study_participants. Kept: the ``users`` row and class
membership (enrolment, not research data), and ``audit_log`` (IDs/counts only).
"""
from __future__ import annotations

import sqlite3

from app.domain.constants import Role
from app.domain.errors import NotFound, PermissionDenied, StateConflict
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import (
    Clock, audit, dumps, iso, new_id, require_active_role, require_text, row, user_roles, utc_now,
)

# Order matters: children before parents (FKs are enforced).
_DELETE_PLAN: tuple[tuple[str, str], ...] = (
    ("feedback_reports",
     "DELETE FROM feedback_reports WHERE reporter_id=:u OR message_id IN ("
     " SELECT m.id FROM messages m JOIN learning_sessions s ON s.id=m.session_id WHERE s.student_id=:u)"),
    ("hint_events",
     "DELETE FROM hint_events WHERE session_id IN (SELECT id FROM learning_sessions WHERE student_id=:u)"),
    ("solution_steps",
     "DELETE FROM solution_steps WHERE session_id IN (SELECT id FROM learning_sessions WHERE student_id=:u)"),
    ("messages",
     "DELETE FROM messages WHERE session_id IN (SELECT id FROM learning_sessions WHERE student_id=:u)"),
    ("activity_events",
     "DELETE FROM activity_events WHERE session_id IN (SELECT id FROM learning_sessions WHERE student_id=:u)"),
    ("learning_sessions_children",
     "DELETE FROM learning_sessions WHERE student_id=:u AND parent_session_id IS NOT NULL"),
    ("learning_sessions", "DELETE FROM learning_sessions WHERE student_id=:u"),
    ("item_responses",
     "DELETE FROM item_responses WHERE attempt_id IN (SELECT a.id FROM assessment_attempts a"
     " JOIN study_participants p ON p.id=a.participant_id WHERE p.student_id=:u)"),
    ("assessment_attempts",
     "DELETE FROM assessment_attempts WHERE participant_id IN (SELECT id FROM study_participants WHERE student_id=:u)"),
    ("study_participants", "DELETE FROM study_participants WHERE student_id=:u"),
)


class ErasureRepository:
    def __init__(self, conn: sqlite3.Connection, clock: Clock = utc_now):
        self.conn = conn
        self.clock = clock

    def get(self, request_id: str) -> dict:
        r = row(self.conn.execute("SELECT * FROM erasure_requests WHERE id=?", (request_id,)).fetchone())
        if r is None:
            raise NotFound("Erasure request not found")
        return r

    def request(self, *, requester_id: str, subject_user_id: str, reason: str) -> dict:
        reason = require_text("reason", reason, max_len=1000)
        require_active_role(self.conn, requester_id)
        roles = user_roles(self.conn, requester_id)
        if Role.ADMIN not in roles:
            if Role.RESEARCHER not in roles or not self.conn.execute(
                    "SELECT 1 FROM study_participants p JOIN study_researchers r ON r.study_id=p.study_id"
                    " WHERE p.student_id=? AND r.researcher_id=?", (subject_user_id, requester_id)).fetchone():
                raise PermissionDenied("Only an admin or a researcher of the subject's study may request erasure")
        rid = new_id()
        with transaction(self.conn):
            if self.conn.execute("SELECT 1 FROM users WHERE id=?", (subject_user_id,)).fetchone() is None:
                raise NotFound("Subject not found")
            self.conn.execute("INSERT INTO erasure_requests(id, subject_user_id, reason, requested_by) VALUES(?,?,?,?)",
                              (rid, subject_user_id, reason, requester_id))
            audit(self.conn, actor_id=requester_id, action="erasure.request", entity_type="erasure_request",
                  entity_id=rid, details={"subject_user_id": subject_user_id})
        return self.get(rid)

    def _decide(self, request_id: str, approver_id: str, status: str) -> dict:
        require_active_role(self.conn, approver_id, Role.ADMIN)
        with transaction(self.conn):
            r = self.get(request_id)
            if r["requested_by"] == approver_id:
                raise PermissionDenied("Requester cannot approve their own erasure request")
            if r["status"] != "pending":
                raise StateConflict(f"Request is {r['status']}")
            self.conn.execute("UPDATE erasure_requests SET status=?, approved_by=?, approved_at=? WHERE id=?",
                              (status, approver_id, iso(self.clock()), request_id))
            audit(self.conn, actor_id=approver_id, action=f"erasure.{status}", entity_type="erasure_request",
                  entity_id=request_id)
        return self.get(request_id)

    def approve(self, *, request_id: str, approver_id: str) -> dict:
        return self._decide(request_id, approver_id, "approved")

    def reject(self, *, request_id: str, approver_id: str) -> dict:
        return self._decide(request_id, approver_id, "rejected")

    def execute(self, *, request_id: str, executor_id: str) -> dict:
        """Hard delete. ``secure_delete`` overwrites freed pages and the WAL is
        checkpointed afterwards so deleted content does not linger in the live
        files. Existing BACKUPS still contain the data (see PHASE2_REPORT §8)."""
        require_active_role(self.conn, executor_id, Role.ADMIN)
        previous = self.conn.execute("PRAGMA secure_delete").fetchone()[0]
        self.conn.execute("PRAGMA secure_delete=ON")
        try:
            result = self._execute(request_id, executor_id)
        finally:
            self.conn.execute(f"PRAGMA secure_delete={int(previous)}")
        self.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        return result

    def _execute(self, request_id: str, executor_id: str) -> dict:
        with transaction(self.conn):
            r = self.get(request_id)
            if r["status"] != "approved":
                raise StateConflict(f"Request is {r['status']}, expected approved")
            self.conn.execute("UPDATE erasure_requests SET status='executing' WHERE id=?", (request_id,))
            summary = {}
            for label, sql in _DELETE_PLAN:
                summary[label] = self.conn.execute(sql, {"u": r["subject_user_id"]}).rowcount
            self.conn.execute(
                "UPDATE erasure_requests SET status='executed', executed_by=?, executed_at=?, summary=? WHERE id=?",
                (executor_id, iso(self.clock()), dumps(summary), request_id))
            audit(self.conn, actor_id=executor_id, action="erasure.execute", entity_type="erasure_request",
                  entity_id=request_id, details=summary)
        return self.get(request_id)
