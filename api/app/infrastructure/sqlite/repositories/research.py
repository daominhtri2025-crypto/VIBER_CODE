"""Studies, groups, participants, assessments (creation side) — handoff §5.6.

Researchers act only inside studies they are listed on (``study_researchers``).
``participant_code`` is a pseudonym unique per study, generated server-side.
"""
from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime

from app.domain.constants import Role
from app.domain.errors import NotFound, PermissionDenied, StateConflict, ValidationFailed
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import (
    Clock, audit, dumps, iso, new_id, require_active_role, require_text, row, rows, utc_now,
)

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I confusion


class StudyRepository:
    def __init__(self, conn: sqlite3.Connection, clock: Clock = utc_now):
        self.conn = conn
        self.clock = clock

    def require_researcher(self, study_id: str, researcher_id: str) -> None:
        require_active_role(self.conn, researcher_id, Role.RESEARCHER)
        if not self.conn.execute("SELECT 1 FROM study_researchers WHERE study_id=? AND researcher_id=?",
                                 (study_id, researcher_id)).fetchone():
            raise NotFound("Study not found")

    def create_study(self, *, researcher_id: str, title: str, start_at: datetime | None = None,
                     end_at: datetime | None = None) -> dict:
        require_active_role(self.conn, researcher_id, Role.RESEARCHER)
        sid = new_id()
        with transaction(self.conn):
            self.conn.execute("INSERT INTO studies(id, title, start_at, end_at) VALUES(?,?,?,?)",
                              (sid, require_text("title", title, max_len=200),
                               iso(start_at) if start_at else None, iso(end_at) if end_at else None))
            self.conn.execute("INSERT INTO study_researchers(study_id, researcher_id) VALUES(?,?)", (sid, researcher_id))
            audit(self.conn, actor_id=researcher_id, action="study.create", entity_type="study", entity_id=sid)
        return row(self.conn.execute("SELECT * FROM studies WHERE id=?", (sid,)).fetchone())

    def add_researcher(self, *, study_id: str, actor_id: str, researcher_id: str) -> None:
        self.require_researcher(study_id, actor_id)
        require_active_role(self.conn, researcher_id, Role.RESEARCHER)
        with transaction(self.conn):
            self.conn.execute("INSERT OR IGNORE INTO study_researchers(study_id, researcher_id) VALUES(?,?)",
                              (study_id, researcher_id))
            audit(self.conn, actor_id=actor_id, action="study.add_researcher", entity_type="study",
                  entity_id=study_id, details={"researcher_id": researcher_id})

    def create_group(self, *, study_id: str, researcher_id: str, name: str, condition: str) -> dict:
        self.require_researcher(study_id, researcher_id)
        if condition not in ("ai_guided", "comparison"):
            raise ValidationFailed("condition must be ai_guided|comparison")
        gid = new_id()
        with transaction(self.conn):
            self.conn.execute("INSERT INTO study_groups(id, study_id, name, condition) VALUES(?,?,?,?)",
                              (gid, study_id, require_text("name", name, max_len=100), condition))
        return row(self.conn.execute("SELECT * FROM study_groups WHERE id=?", (gid,)).fetchone())

    def add_participant(self, *, study_id: str, researcher_id: str, student_id: str, group_id: str) -> dict:
        self.require_researcher(study_id, researcher_id)
        try:
            require_active_role(self.conn, student_id, Role.STUDENT)
        except (PermissionDenied, NotFound) as exc:
            raise ValidationFailed("Participant must be an active student") from exc
        with transaction(self.conn):
            for _ in range(20):
                code = "P-" + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
                if not self.conn.execute("SELECT 1 FROM study_participants WHERE study_id=? AND participant_code=?",
                                         (study_id, code)).fetchone():
                    break
            pid = new_id()
            # FK (group_id, study_id) rejects a group of another study; UNIQUE(study_id, student_id) one group.
            self.conn.execute("INSERT INTO study_participants(id, study_id, group_id, student_id, participant_code)"
                              " VALUES(?,?,?,?,?)", (pid, study_id, group_id, student_id, code))
            audit(self.conn, actor_id=researcher_id, action="study.add_participant", entity_type="study",
                  entity_id=study_id, details={"participant_id": pid})
        return {"participant_id": pid, "participant_code": code, "group_id": group_id}

    def create_assessment(self, *, study_id: str, researcher_id: str, title: str, phase: str,
                          rubric_version: str, items: list[dict], opens_at: datetime | None = None,
                          closes_at: datetime | None = None) -> dict:
        """items: [{problem_id, problem_version, max_solution_score, max_explanation_score}] in order."""
        self.require_researcher(study_id, researcher_id)
        if phase not in ("pre", "post", "retention"):
            raise ValidationFailed("phase must be pre|post|retention")
        if not items:
            raise ValidationFailed("An assessment needs at least one item")
        if opens_at and closes_at and closes_at <= opens_at:
            raise ValidationFailed("closes_at must be after opens_at")
        aid = new_id()
        with transaction(self.conn):
            self.conn.execute(
                "INSERT INTO assessments(id, study_id, title, phase, rubric_version) VALUES(?,?,?,?,?)",
                (aid, study_id, require_text("title", title, max_len=200), phase,
                 require_text("rubric_version", rubric_version, max_len=50)))
            self.conn.execute("INSERT INTO assessment_schedules(assessment_id, opens_at, closes_at) VALUES(?,?,?)",
                              (aid, iso(opens_at) if opens_at else None, iso(closes_at) if closes_at else None))
            for pos, it in enumerate(items, start=1):
                self.conn.execute(  # trigger: problem version must be approved
                    "INSERT INTO assessment_items(id, assessment_id, problem_id, problem_version, position,"
                    " max_solution_score, max_explanation_score) VALUES(?,?,?,?,?,?,?)",
                    (new_id(), aid, it["problem_id"], int(it["problem_version"]), pos,
                     float(it["max_solution_score"]), float(it["max_explanation_score"])))
            audit(self.conn, actor_id=researcher_id, action="assessment.create", entity_type="assessment",
                  entity_id=aid, details={"items": len(items), "phase": phase})
        return {"id": aid, "items": rows(self.conn.execute(
            "SELECT id, position, problem_id, problem_version, max_solution_score, max_explanation_score"
            " FROM assessment_items WHERE assessment_id=? ORDER BY position", (aid,)))}

    def publish_results(self, *, assessment_id: str, researcher_id: str) -> None:
        a = self.conn.execute("SELECT study_id FROM assessments WHERE id=?", (assessment_id,)).fetchone()
        if a is None:
            raise NotFound("Assessment not found")
        self.require_researcher(a["study_id"], researcher_id)
        with transaction(self.conn):
            self.conn.execute("INSERT OR IGNORE INTO assessment_schedules(assessment_id) VALUES(?)", (assessment_id,))
            cur = self.conn.execute("UPDATE assessment_schedules SET results_published_at=? WHERE assessment_id=?"
                                    " AND results_published_at IS NULL", (iso(self.clock()), assessment_id))
            if cur.rowcount == 0:
                raise StateConflict("Results already published")
            audit(self.conn, actor_id=researcher_id, action="assessment.publish", entity_type="assessment",
                  entity_id=assessment_id)

    def responses_for_grading(self, *, study_id: str, researcher_id: str, only_ungraded: bool = True) -> list[dict]:
        """Blind grading view: participant_code only, no group/condition, no names (handoff §5.6 step 5)."""
        self.require_researcher(study_id, researcher_id)
        sql = ("SELECT r.id AS response_id, p.participant_code, s.phase, i.position, pv.statement, r.solution,"
               " r.explanation, i.max_solution_score, i.max_explanation_score, r.solution_score, r.explanation_score"
               " FROM item_responses r JOIN assessment_attempts a ON a.id=r.attempt_id"
               " JOIN assessments s ON s.id=a.assessment_id JOIN study_participants p ON p.id=a.participant_id"
               " JOIN assessment_items i ON i.id=r.item_id"
               " JOIN problem_versions pv ON pv.problem_id=i.problem_id AND pv.version=i.problem_version"
               " WHERE a.study_id=? AND a.submitted_at IS NOT NULL")
        if only_ungraded:
            sql += " AND r.solution_score IS NULL"
        return rows(self.conn.execute(sql + " ORDER BY s.phase, i.position, r.id", (study_id,)))

    def study_of_response(self, response_id: str) -> str:
        r = self.conn.execute("SELECT a.study_id FROM item_responses r JOIN assessment_attempts a ON a.id=r.attempt_id"
                              " WHERE r.id=?", (response_id,)).fetchone()
        if r is None:
            raise NotFound("Response not found")
        return r[0]


class FeedbackReportRepository:
    """Students flag tutor messages; the class teacher reviews/resolves them."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create(self, *, reporter_id: str, message_id: str, reason: str) -> dict:
        m = self.conn.execute("SELECT m.id, s.student_id FROM messages m JOIN learning_sessions s ON s.id=m.session_id"
                              " WHERE m.id=? AND m.sender_type IN ('assistant','system')", (message_id,)).fetchone()
        if m is None or m["student_id"] != reporter_id:
            raise NotFound("Message not found")
        rid = new_id()
        with transaction(self.conn):
            self.conn.execute("INSERT INTO feedback_reports(id, message_id, reporter_id, reason) VALUES(?,?,?,?)",
                              (rid, message_id, reporter_id, require_text("reason", reason, max_len=1000)))
        return row(self.conn.execute("SELECT id, message_id, status FROM feedback_reports WHERE id=?", (rid,)).fetchone())

    def list_for_teacher(self, *, teacher_id: str, status: str | None = None) -> list[dict]:
        require_active_role(self.conn, teacher_id, Role.TEACHER)
        sql = ("SELECT f.id, f.reason, f.status, f.resolution, m.content AS message_content, s.id AS session_id,"
               " c.id AS class_id FROM feedback_reports f JOIN messages m ON m.id=f.message_id"
               " JOIN learning_sessions s ON s.id=m.session_id JOIN assignments a ON a.id=s.assignment_id"
               " JOIN classes c ON c.id=a.class_id WHERE c.teacher_id=?")
        args: tuple = (teacher_id,)
        if status:
            sql += " AND f.status=?"
            args += (status,)
        return rows(self.conn.execute(sql + " ORDER BY f.rowid", args))

    def resolve(self, *, teacher_id: str, report_id: str, status: str, resolution: str | None) -> dict:
        require_active_role(self.conn, teacher_id, Role.TEACHER)
        if status not in ("reviewing", "resolved"):
            raise ValidationFailed("status must be reviewing|resolved")
        ok = self.conn.execute(
            "SELECT 1 FROM feedback_reports f JOIN messages m ON m.id=f.message_id"
            " JOIN learning_sessions s ON s.id=m.session_id JOIN assignments a ON a.id=s.assignment_id"
            " JOIN classes c ON c.id=a.class_id WHERE f.id=? AND c.teacher_id=?", (report_id, teacher_id)).fetchone()
        if not ok:
            raise NotFound("Report not found")
        with transaction(self.conn):
            self.conn.execute("UPDATE feedback_reports SET status=?, resolution=?, reviewer_id=? WHERE id=?",
                              (status, resolution, teacher_id, report_id))
            audit(self.conn, actor_id=teacher_id, action="feedback_report.update", entity_type="feedback_report",
                  entity_id=report_id, details={"status": status})
        return row(self.conn.execute("SELECT id, status, resolution FROM feedback_reports WHERE id=?",
                                     (report_id,)).fetchone())


class AIConfigRepository:
    """Versioned AI configs: rows are immutable; activation is an append-only log."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create(self, *, admin_id: str, provider: str, model_name: str, prompt_version: str, parameters: dict) -> dict:
        require_active_role(self.conn, admin_id, Role.ADMIN)
        if "api_key" in {k.lower() for k in parameters}:
            raise ValidationFailed("API keys belong in the environment, never in ai_configs")
        cid = new_id()
        with transaction(self.conn):
            self.conn.execute("INSERT INTO ai_configs(id, provider, model_name, prompt_version, parameters)"
                              " VALUES(?,?,?,?,?)", (cid, require_text("provider", provider, max_len=50),
                                                     require_text("model_name", model_name, max_len=100),
                                                     require_text("prompt_version", prompt_version, max_len=100),
                                                     dumps(parameters)))
            audit(self.conn, actor_id=admin_id, action="ai_config.create", entity_type="ai_config", entity_id=cid)
        return {"id": cid}

    def activate(self, *, admin_id: str, ai_config_id: str) -> None:
        require_active_role(self.conn, admin_id, Role.ADMIN)
        if not self.conn.execute("SELECT 1 FROM ai_configs WHERE id=?", (ai_config_id,)).fetchone():
            raise NotFound("AI config not found")
        with transaction(self.conn):
            self.conn.execute("INSERT INTO ai_config_activations(id, ai_config_id, activated_by) VALUES(?,?,?)",
                              (new_id(), ai_config_id, admin_id))
            audit(self.conn, actor_id=admin_id, action="ai_config.activate", entity_type="ai_config",
                  entity_id=ai_config_id)

    def active_id(self) -> str | None:
        r = self.conn.execute("SELECT ai_config_id FROM ai_config_activations ORDER BY activated_at DESC, rowid DESC"
                              " LIMIT 1").fetchone()
        return r[0] if r else None

    def usage_summary(self, *, admin_id: str, since: str) -> list[dict]:
        require_active_role(self.conn, admin_id, Role.ADMIN)
        return rows(self.conn.execute(
            "SELECT purpose, outcome, count(*) AS n, coalesce(sum(cost_usd),0) AS cost_usd,"
            " coalesce(avg(latency_ms),0) AS avg_latency_ms FROM ai_usage WHERE occurred_at>=?"
            " GROUP BY purpose, outcome ORDER BY purpose, outcome", (since,)))
