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
from app.infrastructure.sqlite.repositories._common import parse_iso, require_active_role, rows
from app.infrastructure.sqlite.repositories.classes import ClassRepository

IDLE_THRESHOLD_SECONDS = 300  # gaps longer than this are not counted as learning time
PROCESS_EXPORT_COLUMNS = ("participant_code", "condition", "sessions", "steps", "invalid_steps", "unknown_steps",
                          "hints_requested", "hints_offered", "max_hint_level", "active_minutes")

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

    # ------------------------------------------------- process metrics (§9.2)
    def active_seconds(self, session_id: str, idle_threshold: int = IDLE_THRESHOLD_SECONDS) -> float:
        """Active time from activity_events: sum of gaps between consecutive events,
        skipping paused intervals (pause→resume) and gaps above ``idle_threshold``.
        NOT started_at→completed_at (handoff §7 GĐ3 item 9)."""
        events = self.conn.execute("SELECT event_type, occurred_at FROM activity_events WHERE session_id=?"
                                   " ORDER BY occurred_at, rowid", (session_id,)).fetchall()
        total, prev = 0.0, None
        for e in events:
            t = parse_iso(e["occurred_at"])
            if prev is not None and prev["event_type"] not in ("pause", "finish"):
                gap = (t - parse_iso(prev["occurred_at"])).total_seconds()
                if 0 < gap <= idle_threshold:
                    total += gap
            prev = e
        return total

    def process_metrics(self, *, study_id: str, researcher_id: str) -> list[dict]:
        """Per participant, only sessions explicitly linked to the study (study_id) — §5.6 step 8."""
        self._require_study_researcher(study_id, researcher_id)
        out = []
        for p in self.conn.execute(
                "SELECT p.participant_code, p.student_id, g.condition FROM study_participants p"
                " JOIN study_groups g ON g.id=p.group_id WHERE p.study_id=? ORDER BY p.participant_code", (study_id,)):
            sessions = [r[0] for r in self.conn.execute(
                "SELECT id FROM learning_sessions WHERE study_id=? AND student_id=?", (study_id, p["student_id"]))]
            q = ",".join("?" * len(sessions)) or "NULL"
            agg = self.conn.execute(
                f"SELECT (SELECT count(*) FROM solution_steps WHERE session_id IN ({q})),"
                f" (SELECT count(*) FROM solution_steps WHERE session_id IN ({q}) AND math_status='invalid'),"
                f" (SELECT count(*) FROM solution_steps WHERE session_id IN ({q}) AND math_status='unknown'),"
                f" (SELECT count(*) FROM hint_events WHERE session_id IN ({q}) AND trigger='student_request'),"
                f" (SELECT count(*) FROM hint_events WHERE session_id IN ({q}) AND trigger='system_offer'),"
                f" (SELECT max(hint_level) FROM hint_events WHERE session_id IN ({q}))",
                tuple(sessions) * 6).fetchone()
            out.append({"participant_code": p["participant_code"], "condition": p["condition"],
                        "sessions": len(sessions), "steps": agg[0], "invalid_steps": agg[1], "unknown_steps": agg[2],
                        "hints_requested": agg[3], "hints_offered": agg[4], "max_hint_level": agg[5],
                        "active_minutes": round(sum(self.active_seconds(s) for s in sessions) / 60, 2)})
        return out

    @staticmethod
    def to_csv(rows_: list[dict], columns: tuple[str, ...]) -> str:
        import io
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows_)
        return "\ufeff" + buf.getvalue()
