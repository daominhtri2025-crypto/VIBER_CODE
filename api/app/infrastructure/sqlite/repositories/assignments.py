"""Assignments: a teacher gives approved problem versions to their own class."""
from __future__ import annotations

import sqlite3
from datetime import datetime

from app.domain.constants import LearningMode, Role
from app.domain.errors import NotFound, ValidationFailed
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import (
    audit, iso, new_id, parse_iso, require_active_role, require_text, row, rows,
)
from app.infrastructure.sqlite.repositories.classes import ClassRepository


class AssignmentRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create(self, *, teacher_id: str, class_id: str, title: str, learning_mode: LearningMode | str,
               problems: list[tuple[str, int]], due_at: datetime | None = None) -> str:
        ClassRepository(self.conn).require_teacher_of(class_id, teacher_id)
        if str(learning_mode) not in {m.value for m in LearningMode}:
            raise ValidationFailed("learning_mode invalid")
        if not problems or len(set(problems)) != len(problems):
            raise ValidationFailed("problems must be a non-empty list without duplicates")
        aid = new_id()
        with transaction(self.conn):
            self.conn.execute(
                "INSERT INTO assignments(id, class_id, creator_id, title, learning_mode, due_at) VALUES(?,?,?,?,?,?)",
                (aid, class_id, teacher_id, require_text("title", title, max_len=200), str(learning_mode),
                 iso(due_at) if due_at else None))
            # Trigger approved_assignment_problem rejects non-approved versions.
            self.conn.executemany(
                "INSERT INTO assignment_problems(assignment_id, problem_id, problem_version, position) VALUES(?,?,?,?)",
                [(aid, pid, ver, pos) for pos, (pid, ver) in enumerate(problems, start=1)])
            audit(self.conn, actor_id=teacher_id, action="assignment.create", entity_type="assignment",
                  entity_id=aid, details={"class_id": class_id, "problems": [f"{p}@{v}" for p, v in problems]})
        return aid

    def get_for_student(self, assignment_id: str, student_id: str) -> dict:
        """Assignment visible to a member student; 404 otherwise."""
        a = row(self.conn.execute(
            "SELECT a.id, a.class_id, a.title, a.learning_mode, a.due_at FROM assignments a"
            " JOIN class_members m ON m.class_id=a.class_id WHERE a.id=? AND m.student_id=?",
            (assignment_id, student_id)).fetchone())
        if a is None:
            raise NotFound("Assignment not found")
        a["problems"] = rows(self.conn.execute(
            "SELECT ap.position, pv.problem_id, pv.version, pv.statement, pv.difficulty"
            " FROM assignment_problems ap JOIN problem_versions pv"
            "  ON pv.problem_id=ap.problem_id AND pv.version=ap.problem_version"
            " WHERE ap.assignment_id=? ORDER BY ap.position", (assignment_id,)))
        return a

    def list_for_student(self, student_id: str) -> list[dict]:
        require_active_role(self.conn, student_id, Role.STUDENT)
        ids = [r[0] for r in self.conn.execute(
            "SELECT a.id FROM assignments a JOIN class_members m ON m.class_id=a.class_id"
            " WHERE m.student_id=? ORDER BY coalesce(a.due_at,'9999'), a.title", (student_id,))]
        return [self.get_for_student(i, student_id) for i in ids]

    @staticmethod
    def is_past_due(assignment: dict, now: datetime) -> bool:
        return bool(assignment.get("due_at")) and parse_iso(assignment["due_at"]) < now
