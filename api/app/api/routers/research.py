"""Researcher endpoints: studies, groups, participants, assessments, blind grading, export.
Scope: only studies listed in study_researchers for the caller (404 otherwise)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.deps import db, require
from app.api.schemas import AssessmentIn, ErasureIn, GradeIn, GroupIn, ParticipantIn, ResearcherIn, StudyIn
from app.application.auth_service import Actor
from app.domain.constants import Role
from app.infrastructure.sqlite.repositories import AssessmentRepository, ErasureRepository, ReportRepository
from app.infrastructure.sqlite.repositories.reports import PROCESS_EXPORT_COLUMNS, RESEARCH_EXPORT_COLUMNS
from app.infrastructure.sqlite.repositories.research import StudyRepository

router = APIRouter(tags=["research"])
researcher = require(Role.RESEARCHER)


@router.post("/studies", status_code=201)
def create_study(body: StudyIn, actor: Actor = Depends(researcher), conn=Depends(db)) -> dict:
    return StudyRepository(conn).create_study(researcher_id=actor.id, title=body.title, start_at=body.start_at,
                                              end_at=body.end_at)


@router.post("/studies/{study_id}/researchers", status_code=204, response_class=Response)
def add_researcher(study_id: str, body: ResearcherIn, actor: Actor = Depends(researcher), conn=Depends(db)):
    StudyRepository(conn).add_researcher(study_id=study_id, actor_id=actor.id, researcher_id=body.researcher_id)


@router.post("/studies/{study_id}/groups", status_code=201)
def create_group(study_id: str, body: GroupIn, actor: Actor = Depends(researcher), conn=Depends(db)) -> dict:
    return StudyRepository(conn).create_group(study_id=study_id, researcher_id=actor.id, name=body.name,
                                              condition=body.condition)


@router.post("/studies/{study_id}/participants", status_code=201)
def add_participant(study_id: str, body: ParticipantIn, actor: Actor = Depends(researcher), conn=Depends(db)) -> dict:
    return StudyRepository(conn).add_participant(study_id=study_id, researcher_id=actor.id,
                                                 student_id=body.student_id, group_id=body.group_id)


@router.post("/studies/{study_id}/assessments", status_code=201)
def create_assessment(study_id: str, body: AssessmentIn, actor: Actor = Depends(researcher), conn=Depends(db)) -> dict:
    return StudyRepository(conn).create_assessment(
        study_id=study_id, researcher_id=actor.id, title=body.title, phase=body.phase,
        rubric_version=body.rubric_version, items=[i.model_dump() for i in body.items],
        opens_at=body.opens_at, closes_at=body.closes_at)


@router.post("/assessments/{assessment_id}/publish", status_code=204, response_class=Response)
def publish(assessment_id: str, actor: Actor = Depends(researcher), conn=Depends(db)):
    StudyRepository(conn).publish_results(assessment_id=assessment_id, researcher_id=actor.id)


@router.get("/studies/{study_id}/responses")
def responses(study_id: str, ungraded: bool = True, actor: Actor = Depends(researcher), conn=Depends(db)) -> list[dict]:
    return StudyRepository(conn).responses_for_grading(study_id=study_id, researcher_id=actor.id,
                                                       only_ungraded=ungraded)


@router.patch("/responses/{response_id}/grade")
def grade(response_id: str, body: GradeIn, actor: Actor = Depends(researcher), conn=Depends(db)) -> dict:
    StudyRepository(conn).require_researcher(StudyRepository(conn).study_of_response(response_id), actor.id)
    r = AssessmentRepository(conn).grade_response(grader_id=actor.id, response_id=response_id,
                                                  solution_score=body.solution_score,
                                                  explanation_score=body.explanation_score)
    return {k: r[k] for k in ("id", "solution_score", "explanation_score", "grader_id")}


@router.get("/studies/{study_id}/export")
def export_results(study_id: str, actor: Actor = Depends(researcher), conn=Depends(db)) -> Response:
    reports = ReportRepository(conn)
    data = reports.research_results(study_id=study_id, researcher_id=actor.id)
    return Response(reports.to_csv(data, RESEARCH_EXPORT_COLUMNS), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="results_{study_id}.csv"'})


@router.get("/studies/{study_id}/export/process")
def export_process(study_id: str, actor: Actor = Depends(researcher), conn=Depends(db)) -> Response:
    reports = ReportRepository(conn)
    data = reports.process_metrics(study_id=study_id, researcher_id=actor.id)
    return Response(reports.to_csv(data, PROCESS_EXPORT_COLUMNS), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="process_{study_id}.csv"'})


@router.post("/erasure-requests", status_code=201)
def request_erasure(body: ErasureIn, actor: Actor = Depends(require(Role.RESEARCHER, Role.ADMIN)),
                    conn=Depends(db)) -> dict:
    r = ErasureRepository(conn).request(requester_id=actor.id, subject_user_id=body.subject_user_id,
                                        reason=body.reason)
    return {"id": r["id"], "status": r["status"]}
