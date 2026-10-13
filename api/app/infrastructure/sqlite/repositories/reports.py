"""Scoped read models for reports and research export.

Views do not enforce access; every method checks the caller's scope first.
Research export uses a column **allowlist** (handoff §5.6 step 7) and never
includes names, auth_subject, student_id or the participant mapping table.
"""
from __future__ import annotations

import csv
import sqlite3
from pathlib import Path

from app.domain.constants import Role
from app.domain.errors import NotFound
from app.infrastructure.sqlite.repositories._common import require_active_role, rows
from app.infrastructure.sqlite.repositories.classes import ClassRepository

RESEARCH_EXPORT_COLUMNS = ("participant_code", "condition", "phase", "attempt_id", "total_score",
                           "expected_items", "answered_items", "graded_items")


class ReportRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def student_sessions(self, student_id: str) -> list[dict]:
        return rows(self.conn.execute(
            "SELECT * FROM session_summary WHERE student_id=? ORDER BY id", (student_id,)))

    def class_sessions(self, *, class_id: str, teacher_id: str) -> list[dict]:
        ClassRepository(self.conn).require_teacher_of(class_id, teacher_id)
        return rows(self.conn.execute(
            "SELECT s.*, u.display_name FROM session_summary s JOIN users u ON u.id=s.student_id"
            " JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=? ORDER BY u.display_name, s.id",
            (class_id,)))

    def error_distribution(self, *, class_id: str, teacher_id: str) -> list[dict]:
        """invalid vs unknown are reported separately (unknown is not 'wrong')."""
        ClassRepository(self.conn).require_teacher_of(class_id, teacher_id)
        return rows(self.conn.execute(
            "SELECT t.math_status, t.error_code, count(*) AS occurrences FROM solution_steps t"
            " JOIN learning_sessions s ON s.id=t.session_id JOIN assignments a ON a.id=s.assignment_id"
            " WHERE a.class_id=? AND t.math_status<>'valid' GROUP BY t.math_status, t.error_code"
            " ORDER BY occurrences DESC", (class_id,)))

    def _require_study_researcher(self, study_id: str, researcher_id: str) -> None:
        require_active_role(self.conn, researcher_id, Role.RESEARCHER)
        if not self.conn.execute("SELECT 1 FROM study_researchers WHERE study_id=? AND researcher_id=?",
                                 (study_id, researcher_id)).fetchone():
            raise NotFound("Study not found")

    def research_results(self, *, study_id: str, researcher_id: str) -> list[dict]:
        self._require_study_researcher(study_id, researcher_id)
        cols = ", ".join(RESEARCH_EXPORT_COLUMNS)
        return rows(self.conn.execute(
            f"SELECT {cols} FROM research_results WHERE study_id=? ORDER BY participant_code, phase, attempt_id",
            (study_id,)))

    def export_research_csv(self, *, study_id: str, researcher_id: str, out_path: str | Path) -> Path:
        data = self.research_results(study_id=study_id, researcher_id=researcher_id)
        out_path = Path(out_path)
        with out_path.open("w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=RESEARCH_EXPORT_COLUMNS)
            w.writeheader()
            # NULL total_score is written as empty (not 0): "not yet gradable".
            w.writerows(data)
        return out_path
