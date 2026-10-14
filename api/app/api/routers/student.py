"""Student endpoints: assignments, learning sessions, assessments, feedback reports.

Every mutation that carries ``request_id`` goes through ``idempotent`` so a
retry returns exactly the stored body (including AI-phrased text).
Independent mode and assessments never call the AI (enforced in services).
"""
from __future__ import annotations

import sqlite3
from dataclasses import asdict

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.deps import AppContext, ctx, db, idempotent, require
from app.api.schemas import (
    ActivityIn, ChoiceIn, FeedbackReportIn, HintIn, ReadIn, ResponseIn, StartSessionIn, StepIn, SubmitIn, VerifyIn,
)
from app.application.ai_feedback import AI_DISCLOSURE, AIFeedbackService
from app.application.auth_service import Actor
from app.application.session_service import SessionService, TutorReply
from app.domain.constants import Role
from app.domain.tutor_ai import Purpose
from app.infrastructure.sqlite.repositories import AssessmentRepository, AssignmentRepository, SessionRepository
from app.infrastructure.sqlite.repositories.research import AIConfigRepository, FeedbackReportRepository

router = APIRouter(tags=["student"])
student = require(Role.STUDENT)


def _svc(conn: sqlite3.Connection, c: AppContext) -> SessionService:
    return SessionService(conn, content=c.content)


def _ai(conn: sqlite3.Connection, c: AppContext) -> AIFeedbackService:
    return AIFeedbackService(conn, c.settings, c.tutor, c.content)


def _out(reply: TutorReply, *, ai_generated: bool = False, message_id: str | None = None) -> dict:
    body = asdict(reply)
    body["ai_generated"] = ai_generated
    body["ai_message_id"] = message_id
    body["ai_disclosure"] = AI_DISCLOSURE if ai_generated else None
    return body


def _with_ai(conn, c, reply: TutorReply, purpose: Purpose) -> dict:
    r = _ai(conn, c).enhance(reply, purpose=purpose)
    return _out(r.reply, ai_generated=r.ai_generated, message_id=r.message_id)


@router.get("/assignments")
def assignments(actor: Actor = Depends(student), conn=Depends(db)) -> list[dict]:
    return AssignmentRepository(conn).list_for_student(actor.id)


@router.post("/sessions", status_code=201)
def start_session(body: StartSessionIn, actor: Actor = Depends(student), conn=Depends(db),
                  c: AppContext = Depends(ctx)) -> dict:
    reply = _svc(conn, c).start(student_id=actor.id, problem_id=body.problem_id,
                                problem_version=body.problem_version, assignment_id=body.assignment_id,
                                ai_config_id=AIConfigRepository(conn).active_id())
    return _out(reply)


@router.get("/sessions/{session_id}")
def view_session(session_id: str, actor: Actor = Depends(student), conn=Depends(db),
                 c: AppContext = Depends(ctx)) -> dict:
    return _out(_svc(conn, c).view(student_id=actor.id, session_id=session_id))


@router.get("/sessions/{session_id}/messages")
def session_messages(session_id: str, actor: Actor = Depends(student), conn=Depends(db)) -> list[dict]:
    repo = SessionRepository(conn)
    repo.get_for_owner(session_id, actor.id)
    visible = ("feedback", "hint", "ai_feedback", "attempt")
    return [{"id": m["id"], "sender_type": m["sender_type"], "text": m["text"], "kind": m["meta"].get("kind"),
             "created_at": m["created_at"]}
            for m in repo.list_messages(session_id) if m["meta"].get("kind") in visible and m["text"]]


@router.post("/sessions/{session_id}/read")
def read_problem(session_id: str, body: ReadIn, actor: Actor = Depends(student), conn=Depends(db),
                 c: AppContext = Depends(ctx)):
    return idempotent(conn, actor_id=actor.id, route=f"read:{session_id}", request_id=body.request_id,
                      payload=body.model_dump(), run=lambda: _out(_svc(conn, c).read_problem(
                          student_id=actor.id, session_id=session_id, expected_version=body.expected_version,
                          request_id=body.request_id, restatement=body.restatement)))


@router.post("/sessions/{session_id}/knowledge")
def knowledge(session_id: str, body: ChoiceIn, actor: Actor = Depends(student), conn=Depends(db),
              c: AppContext = Depends(ctx)):
    return idempotent(conn, actor_id=actor.id, route=f"knowledge:{session_id}", request_id=body.request_id,
                      payload=body.model_dump(), run=lambda: _out(_svc(conn, c).answer_knowledge(
                          student_id=actor.id, session_id=session_id, expected_version=body.expected_version,
                          request_id=body.request_id, option_id=body.option_id, explanation=body.explanation)))


@router.post("/sessions/{session_id}/plan")
def plan(session_id: str, body: ChoiceIn, actor: Actor = Depends(student), conn=Depends(db),
         c: AppContext = Depends(ctx)):
    return idempotent(conn, actor_id=actor.id, route=f"plan:{session_id}", request_id=body.request_id,
                      payload=body.model_dump(), run=lambda: _out(_svc(conn, c).answer_plan(
                          student_id=actor.id, session_id=session_id, expected_version=body.expected_version,
                          request_id=body.request_id, option_id=body.option_id, explanation=body.explanation)))


@router.post("/sessions/{session_id}/steps")
def submit_step(session_id: str, body: StepIn, actor: Actor = Depends(student), conn=Depends(db),
                c: AppContext = Depends(ctx)):
    def run() -> dict:
        reply = _svc(conn, c).submit_step(
            student_id=actor.id, session_id=session_id, expected_version=body.expected_version,
            request_id=body.request_id, submitted_equation=body.submitted_equation, operation=body.operation,
            operation_value=body.operation_value, explanation=body.explanation)
        return _with_ai(conn, c, reply, Purpose.STEP_FEEDBACK)
    return idempotent(conn, actor_id=actor.id, route=f"steps:{session_id}", request_id=body.request_id,
                      payload=body.model_dump(), run=run)


@router.post("/sessions/{session_id}/hints")
def request_hint(session_id: str, body: HintIn, actor: Actor = Depends(student), conn=Depends(db),
                 c: AppContext = Depends(ctx)):
    def run() -> dict:
        reply = _svc(conn, c).request_hint(student_id=actor.id, session_id=session_id, request_id=body.request_id)
        return _with_ai(conn, c, reply, Purpose.HINT)
    return idempotent(conn, actor_id=actor.id, route=f"hints:{session_id}", request_id=body.request_id,
                      payload=body.model_dump(), run=run)


@router.post("/sessions/{session_id}/verify")
def verify(session_id: str, body: VerifyIn, actor: Actor = Depends(student), conn=Depends(db),
           c: AppContext = Depends(ctx)):
    def run() -> dict:
        reply = _svc(conn, c).verify(student_id=actor.id, session_id=session_id,
                                     expected_version=body.expected_version, request_id=body.request_id,
                                     substitution=body.substitution, conclusion=body.conclusion)
        return _with_ai(conn, c, reply, Purpose.VERIFY_FEEDBACK)
    return idempotent(conn, actor_id=actor.id, route=f"verify:{session_id}", request_id=body.request_id,
                      payload=body.model_dump(), run=run)


@router.post("/sessions/{session_id}/independent")
def independent_practice(session_id: str, actor: Actor = Depends(student), conn=Depends(db),
                         c: AppContext = Depends(ctx)) -> dict:
    child = _svc(conn, c).ensure_independent_practice(student_id=actor.id, parent_session_id=session_id)
    return {"next_session_id": child["id"] if child else None}


@router.post("/sessions/{session_id}/submit")
def submit_independent(session_id: str, body: SubmitIn, actor: Actor = Depends(student), conn=Depends(db),
                       c: AppContext = Depends(ctx)) -> dict:
    return _out(_svc(conn, c).submit_independent(student_id=actor.id, session_id=session_id,
                                                 expected_version=body.expected_version))


@router.post("/sessions/{session_id}/activity", status_code=204, response_class=Response)
def activity(session_id: str, body: ActivityIn, actor: Actor = Depends(student), conn=Depends(db)):
    SessionRepository(conn).record_activity(actor_id=actor.id, session_id=session_id, event_type=body.event_type)


@router.post("/feedback-reports", status_code=201)
def report_feedback(body: FeedbackReportIn, actor: Actor = Depends(student), conn=Depends(db)) -> dict:
    return FeedbackReportRepository(conn).create(reporter_id=actor.id, message_id=body.message_id, reason=body.reason)


# ------------------------------------------------------------ assessments
@router.post("/assessments/{assessment_id}/attempts", status_code=201)
def start_attempt(assessment_id: str, actor: Actor = Depends(student), conn=Depends(db)) -> dict:
    a = AssessmentRepository(conn).start_attempt(student_id=actor.id, assessment_id=assessment_id)
    return {k: a[k] for k in ("id", "assessment_id", "attempt_no", "started_at", "submitted_at")}


@router.get("/attempts/{attempt_id}/items")
def attempt_items(attempt_id: str, actor: Actor = Depends(student), conn=Depends(db)) -> list[dict]:
    return AssessmentRepository(conn).items_for_attempt(student_id=actor.id, attempt_id=attempt_id)


@router.put("/attempts/{attempt_id}/items/{item_id}")
def save_response(attempt_id: str, item_id: str, body: ResponseIn, actor: Actor = Depends(student),
                  conn=Depends(db)) -> dict:
    return AssessmentRepository(conn).save_response(student_id=actor.id, attempt_id=attempt_id, item_id=item_id,
                                                    solution=body.solution, explanation=body.explanation)


@router.post("/attempts/{attempt_id}/submit")
def submit_attempt(attempt_id: str, actor: Actor = Depends(student), conn=Depends(db)) -> dict:
    a = AssessmentRepository(conn).submit_attempt(student_id=actor.id, attempt_id=attempt_id)
    return {"id": a["id"], "submitted_at": a["submitted_at"]}  # no score/feedback before publication


@router.get("/attempts/{attempt_id}/result")
def attempt_result(attempt_id: str, actor: Actor = Depends(student), conn=Depends(db)) -> dict:
    return AssessmentRepository(conn).result_for_student(student_id=actor.id, attempt_id=attempt_id)
