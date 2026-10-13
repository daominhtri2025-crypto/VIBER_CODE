"""Classes and memberships. A teacher only manages classes they own."""
from __future__ import annotations

import sqlite3

from app.domain.constants import Role
from app.domain.errors import NotFound, PermissionDenied
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import (
    new_id, require_active_role, require_text, row, rows,
)


class ClassRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get(self, class_id: str) -> dict:
        c = row(self.conn.execute("SELECT * FROM classes WHERE id=?", (class_id,)).fetchone())
        if c is None:
            raise NotFound("Class not found")
        return c

    def is_teacher_of(self, class_id: str, teacher_id: str) -> bool:
        return self.conn.execute("SELECT 1 FROM classes WHERE id=? AND teacher_id=?",
                                 (class_id, teacher_id)).fetchone() is not None

    def is_member(self, class_id: str, student_id: str) -> bool:
        return self.conn.execute("SELECT 1 FROM class_members WHERE class_id=? AND student_id=?",
                                 (class_id, student_id)).fetchone() is not None

    def require_teacher_of(self, class_id: str, teacher_id: str) -> None:
        require_active_role(self.conn, teacher_id, Role.TEACHER)
        if not self.is_teacher_of(class_id, teacher_id):
            # 404 rather than 403: do not reveal other teachers' classes.
            raise NotFound("Class not found")

    def create(self, *, teacher_id: str, name: str, school_year: str) -> dict:
        require_active_role(self.conn, teacher_id, Role.TEACHER)
        cid = new_id()
        with transaction(self.conn):
            self.conn.execute("INSERT INTO classes(id, teacher_id, name, school_year) VALUES(?,?,?,?)",
                              (cid, teacher_id, require_text("name", name, max_len=120),
                               require_text("school_year", school_year, max_len=20)))
        return self.get(cid)

    def add_member(self, *, class_id: str, student_id: str, teacher_id: str) -> None:
        self.require_teacher_of(class_id, teacher_id)
        try:
            require_active_role(self.conn, student_id, Role.STUDENT)
        except PermissionDenied as exc:
            raise PermissionDenied("Only active students can join a class") from exc
        with transaction(self.conn):
            self.conn.execute("INSERT OR IGNORE INTO class_members(class_id, student_id) VALUES(?,?)",
                              (class_id, student_id))

    def list_members(self, class_id: str, *, teacher_id: str) -> list[dict]:
        self.require_teacher_of(class_id, teacher_id)
        return rows(self.conn.execute(
            "SELECT u.id, u.display_name, u.status FROM class_members m JOIN users u ON u.id=m.student_id"
            " WHERE m.class_id=? ORDER BY u.display_name", (class_id,)))
