"""Read-only listing endpoints needed by the web UI (Phase 4).

Each query is scoped to the caller: a student sees only their own sessions and
the assessments of studies they take part in; a teacher only their classes; a
researcher only their studies. Identifying data (display names) appears only
where the role legitimately needs it (teacher: own class; researcher: own study
during recruitment/grouping — handoff §2.2).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import db, require
from app.application.auth_service import Actor
from app.domain.constants import Role
from app.infrastructure.sqlite.repositories import ClassRepository
from app.infrastructure.sqlite.repositories._common import rows
from app.infrastructure.sqlite.repositories.research import StudyRepository

router = APIRouter(tags=["listing"])


# ------------------------------------------------------------- student
@router.get("/my/sessions")
def my_sessions(actor: Actor = Depends(require(Role.STUDENT)), conn=Depends(db)) -> list[dict]:
    return rows(conn.execute(
        "SELECT s.id, s.learning_mode, s.state, s.assignment_id, s.parent_session_id, s.problem_id, s.problem_version,"
        " pv.statement, ss.step_count, ss.invalid_step_count, ss.requested_hint_count, l.started_at, l.completed_at"
        " FROM session_summary ss JOIN learning_sessions l ON l.id=ss.id"
        " JOIN learning_sessions s ON s.id=l.id"
        " JOIN problem_versions pv ON pv.problem_id=s.problem_id AND pv.version=s.problem_version"
        " WHERE ss.student_id=? ORDER BY l.started_at DESC", (actor.id,)))


@router.get("/my/assessments")
def my_assessments(actor: Actor = Depends(require(Role.STUDENT)), conn=Depends(db)) -> list[dict]:
    return rows(conn.execute(
        "SELECT a.id, a.title, a.phase, sc.opens_at, sc.closes_at, sc.results_published_at,"
        " (SELECT x.id FROM assessment_attempts x WHERE x.assessment_id=a.id AND x.participant_id=p.id"
        "   ORDER BY x.attempt_no DESC LIMIT 1) AS attempt_id,"
        " (SELECT x.submitted_at FROM assessment_attempts x WHERE x.assessment_id=a.id AND x.participant_id=p.id"
        "   ORDER BY x.attempt_no DESC LIMIT 1) AS submitted_at"
        " FROM study_participants p JOIN assessments a ON a.study_id=p.study_id"
        " LEFT JOIN assessment_schedules sc ON sc.assessment_id=a.id WHERE p.student_id=? ORDER BY a.phase, a.title",
        (actor.id,)))


# ------------------------------------------------------------- teacher
teacher = require(Role.TEACHER)


@router.get("/classes")
def my_classes(actor: Actor = Depends(teacher), conn=Depends(db)) -> list[dict]:
    return rows(conn.execute(
        "SELECT c.id, c.name, c.school_year, (SELECT count(*) FROM class_members m WHERE m.class_id=c.id) AS students"
        " FROM classes c WHERE c.teacher_id=? ORDER BY c.school_year DESC, c.name", (actor.id,)))


@router.get("/classes/{class_id}/assignments")
def class_assignments(class_id: str, actor: Actor = Depends(teacher), conn=Depends(db)) -> list[dict]:
    ClassRepository(conn).require_teacher_of(class_id, actor.id)
    return rows(conn.execute("SELECT id, title, learning_mode, due_at FROM assignments WHERE class_id=? ORDER BY rowid",
                             (class_id,)))


@router.get("/topics")
def topics(actor: Actor = Depends(require(Role.TEACHER, Role.RESEARCHER)), conn=Depends(db)) -> list[dict]:
    return rows(conn.execute("SELECT id, name, grade FROM topics ORDER BY grade, name"))


@router.get("/problems")
def problem_bank(actor: Actor = Depends(require(Role.TEACHER, Role.RESEARCHER)), conn=Depends(db)) -> list[dict]:
    """Approved versions of everyone + the caller's own drafts. No solutions in the list view."""
    return rows(conn.execute(
        "SELECT p.id AS problem_id, p.topic_id, p.author_id=? AS mine, v.version, v.statement, v.difficulty,"
        " v.approval_status FROM problems p JOIN problem_versions v ON v.problem_id=p.id"
        " WHERE v.approval_status='approved' OR p.author_id=? ORDER BY p.rowid, v.version", (actor.id, actor.id)))


@router.get("/directory/students")
def student_directory(actor: Actor = Depends(require(Role.TEACHER, Role.RESEARCHER)), conn=Depends(db)) -> list[dict]:
    """Active students for enrolment/recruitment (teacher adding to class, researcher recruiting)."""
    return rows(conn.execute(
        "SELECT u.id, u.display_name FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role_code='student'"
        " WHERE u.status='active' ORDER BY u.display_name"))


# ------------------------------------------------------------ research
researcher = require(Role.RESEARCHER)


@router.get("/studies")
def my_studies(actor: Actor = Depends(researcher), conn=Depends(db)) -> list[dict]:
    return rows(conn.execute(
        "SELECT s.id, s.title, s.start_at, s.end_at FROM studies s JOIN study_researchers r ON r.study_id=s.id"
        " WHERE r.researcher_id=? ORDER BY s.rowid DESC", (actor.id,)))


@router.get("/studies/{study_id}")
def study_detail(study_id: str, actor: Actor = Depends(researcher), conn=Depends(db)) -> dict:
    StudyRepository(conn).require_researcher(study_id, actor.id)
    return {
        "study": dict(conn.execute("SELECT * FROM studies WHERE id=?", (study_id,)).fetchone()),
        "groups": rows(conn.execute("SELECT id, name, condition FROM study_groups WHERE study_id=?", (study_id,))),
        "participants": rows(conn.execute(
            "SELECT p.id, p.participant_code, p.group_id, u.display_name FROM study_participants p"
            " JOIN users u ON u.id=p.student_id WHERE p.study_id=? ORDER BY p.participant_code", (study_id,))),
        "assessments": rows(conn.execute(
            "SELECT a.id, a.title, a.phase, a.rubric_version, sc.opens_at, sc.closes_at, sc.results_published_at,"
            " (SELECT count(*) FROM assessment_items i WHERE i.assessment_id=a.id) AS items"
            " FROM assessments a LEFT JOIN assessment_schedules sc ON sc.assessment_id=a.id WHERE a.study_id=?"
            " ORDER BY a.rowid", (study_id,))),
    }


# --------------------------------------------------------------- admin
admin = require(Role.ADMIN)


@router.get("/admin/users")
def users(actor: Actor = Depends(admin), conn=Depends(db)) -> list[dict]:
    return rows(conn.execute(
        "SELECT u.id, u.display_name, u.email, u.status, c.username,"
        " (SELECT group_concat(role_code, ',') FROM user_roles r WHERE r.user_id=u.id) AS roles"
        " FROM users u LEFT JOIN user_credentials c ON c.user_id=u.id ORDER BY u.display_name"))


@router.get("/admin/ai-configs")
def ai_configs(actor: Actor = Depends(admin), conn=Depends(db)) -> list[dict]:
    active = conn.execute("SELECT ai_config_id FROM ai_config_activations ORDER BY activated_at DESC, rowid DESC"
                          " LIMIT 1").fetchone()
    return [{**r, "active": bool(active and active[0] == r["id"])} for r in rows(conn.execute(
        "SELECT id, provider, model_name, prompt_version, parameters FROM ai_configs ORDER BY rowid"))]


@router.get("/erasure-requests")
def erasure_requests(actor: Actor = Depends(require(Role.ADMIN, Role.RESEARCHER)), conn=Depends(db)) -> list[dict]:
    sql = ("SELECT id, subject_user_id, reason, status, requested_by, requested_at, approved_by, executed_at"
           " FROM erasure_requests")
    if actor.has(Role.ADMIN):
        return rows(conn.execute(sql + " ORDER BY rowid DESC"))
    return rows(conn.execute(sql + " WHERE requested_by=? ORDER BY rowid DESC", (actor.id,)))
