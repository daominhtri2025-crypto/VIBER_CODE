"""Teacher endpoints: classes, problem bank, assignments, reports, feedback reports.
Every query is scoped to classes the teacher owns (404 otherwise)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.deps import db, require
from app.api.schemas import AssignmentIn, ClassIn, DraftPatchIn, FeedbackResolveIn, MemberIn, ProblemIn, VersionIn
from app.application.auth_service import Actor
from app.domain.constants import Role
from app.infrastructure.sqlite.repositories import (
    AssignmentRepository, ClassRepository, ContentRepository, ReportRepository, SessionRepository,
)
from app.infrastructure.sqlite.repositories.research import FeedbackReportRepository

router = APIRouter(tags=["teacher"])
teacher = require(Role.TEACHER)


@router.post("/classes", status_code=201)
def create_class(body: ClassIn, actor: Actor = Depends(teacher), conn=Depends(db)) -> dict:
    return ClassRepository(conn).create(teacher_id=actor.id, name=body.name, school_year=body.school_year)


@router.post("/classes/{class_id}/members", status_code=204, response_class=Response)
def add_member(class_id: str, body: MemberIn, actor: Actor = Depends(teacher), conn=Depends(db)):
    ClassRepository(conn).add_member(class_id=class_id, student_id=body.student_id, teacher_id=actor.id)


@router.get("/classes/{class_id}/members")
def members(class_id: str, actor: Actor = Depends(teacher), conn=Depends(db)) -> list[dict]:
    return ClassRepository(conn).list_members(class_id, teacher_id=actor.id)


@router.post("/problems", status_code=201)
def create_problem(body: ProblemIn, actor: Actor = Depends(teacher), conn=Depends(db)) -> dict:
    return {"id": ContentRepository(conn).create_problem(author_id=actor.id, topic_id=body.topic_id)}


@router.post("/problems/{problem_id}/versions", status_code=201)
def create_version(problem_id: str, body: VersionIn, actor: Actor = Depends(teacher), conn=Depends(db)) -> dict:
    v = ContentRepository(conn).create_version(
        author_id=actor.id, problem_id=problem_id, statement=body.statement, math_spec=body.math_spec.model_dump(),
        teacher_solution=body.teacher_solution, hints=body.hints, difficulty=body.difficulty)
    return {"problem_id": problem_id, "version": v}


@router.patch("/problems/{problem_id}/versions/{version}", status_code=204, response_class=Response)
def edit_draft(problem_id: str, version: int, body: DraftPatchIn, actor: Actor = Depends(teacher),
               conn=Depends(db)):
    fields = body.model_dump(exclude_none=True)
    ContentRepository(conn).update_draft(author_id=actor.id, problem_id=problem_id, version=version, **fields)


@router.post("/problems/{problem_id}/versions/{version}/approve", status_code=204, response_class=Response)
def approve(problem_id: str, version: int, actor: Actor = Depends(teacher), conn=Depends(db)):
    ContentRepository(conn).approve_version(approver_id=actor.id, problem_id=problem_id, version=version)


@router.get("/problems/{problem_id}/versions/{version}")
def get_version(problem_id: str, version: int, actor: Actor = Depends(teacher), conn=Depends(db)) -> dict:
    return ContentRepository(conn).get_version_internal(problem_id, version)  # teachers may see solutions


@router.post("/assignments", status_code=201)
def create_assignment(body: AssignmentIn, actor: Actor = Depends(teacher), conn=Depends(db)) -> dict:
    aid = AssignmentRepository(conn).create(
        teacher_id=actor.id, class_id=body.class_id, title=body.title, learning_mode=body.learning_mode,
        problems=[(p.problem_id, p.problem_version) for p in body.problems], due_at=body.due_at)
    return {"id": aid}


@router.get("/classes/{class_id}/report")
def class_report(class_id: str, actor: Actor = Depends(teacher), conn=Depends(db)) -> dict:
    reports = ReportRepository(conn)
    sessions = reports.class_sessions(class_id=class_id, teacher_id=actor.id)
    for s in sessions:
        s["active_minutes"] = round(reports.active_seconds(s["id"]) / 60, 2)
    flags = conn.execute(
        "SELECT m.session_id, count(*) FROM messages m JOIN learning_sessions s ON s.id=m.session_id"
        " JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=? AND json_valid(m.content)"
        " AND json_extract(m.content,'$.meta.kind')='flag' GROUP BY m.session_id", (class_id,)).fetchall()
    return {"sessions": sessions, "needs_teacher": {r[0]: r[1] for r in flags},
            "errors": reports.error_distribution(class_id=class_id, teacher_id=actor.id)}


@router.get("/teacher/sessions/{session_id}")
def teacher_session(session_id: str, actor: Actor = Depends(teacher), conn=Depends(db)) -> dict:
    repo = SessionRepository(conn)
    s = repo.get_for_teacher(session_id, actor.id)
    return {"session": s, "steps": repo.list_steps(session_id),
            "messages": [{k: m[k] for k in ("id", "sender_type", "text", "meta", "created_at")}
                         for m in repo.list_messages(session_id)]}


@router.get("/feedback-reports")
def list_reports(status: str | None = None, actor: Actor = Depends(teacher), conn=Depends(db)) -> list[dict]:
    return FeedbackReportRepository(conn).list_for_teacher(teacher_id=actor.id, status=status)


@router.patch("/feedback-reports/{report_id}")
def resolve_report(report_id: str, body: FeedbackResolveIn, actor: Actor = Depends(teacher),
                   conn=Depends(db)) -> dict:
    return FeedbackReportRepository(conn).resolve(teacher_id=actor.id, report_id=report_id, status=body.status,
                                                  resolution=body.resolution)
