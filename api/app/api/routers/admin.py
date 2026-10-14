"""Admin endpoints: accounts, roles, AI configs, usage, erasure approval/execution.
Admins do NOT get grading or research export rights by default (handoff §2.1)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.deps import AppContext, ctx, db, require
from app.api.schemas import AIConfigIn, RoleIn, StatusIn, UserIn
from app.application.auth_service import Actor, AuthService
from app.domain.constants import Role
from app.domain.errors import ValidationFailed
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories import ErasureRepository, UserRepository
from app.infrastructure.sqlite.repositories._common import iso
from app.infrastructure.sqlite.repositories.research import AIConfigRepository

router = APIRouter(tags=["admin"])
admin = require(Role.ADMIN)


@router.post("/users", status_code=201)
def create_user(body: UserIn, actor: Actor = Depends(require(Role.ADMIN, Role.TEACHER)), conn=Depends(db),
                c: AppContext = Depends(ctx)) -> dict:
    """Admin: any roles. Teacher: student accounts only (checked in AuthService)."""
    return AuthService(conn, c.settings).create_account(
        actor_id=actor.id, display_name=body.display_name, roles=body.roles, username=body.username,
        initial_password=body.initial_password, email=body.email)


@router.patch("/admin/users/{user_id}/status")
def set_status(user_id: str, body: StatusIn, actor: Actor = Depends(admin), conn=Depends(db)) -> dict:
    if user_id == actor.id and body.status == "disabled":
        raise ValidationFailed("Admins cannot disable themselves")
    u = UserRepository(conn).set_status(user_id, body.status, actor_id=actor.id)
    if body.status == "disabled":  # revoke sessions immediately
        with transaction(conn):
            conn.execute("UPDATE refresh_tokens SET revoked_at=coalesce(revoked_at, ?) WHERE user_id=?",
                         (iso(datetime.now(timezone.utc)), user_id))
    return {"id": u["id"], "status": u["status"]}


@router.post("/admin/users/{user_id}/roles", status_code=204, response_class=Response)
def change_role(user_id: str, body: RoleIn, actor: Actor = Depends(admin), conn=Depends(db)):
    users = UserRepository(conn)
    (users.grant_role if body.grant else users.revoke_role)(user_id, body.role, actor_id=actor.id)


@router.post("/admin/ai-configs", status_code=201)
def create_ai_config(body: AIConfigIn, actor: Actor = Depends(admin), conn=Depends(db),
                     c: AppContext = Depends(ctx)) -> dict:
    c.content.prompt(body.prompt_version)  # must exist and match its checksum
    return AIConfigRepository(conn).create(admin_id=actor.id, provider=body.provider, model_name=body.model_name,
                                           prompt_version=body.prompt_version, parameters=body.parameters)


@router.post("/admin/ai-configs/{config_id}/activate", status_code=204, response_class=Response)
def activate_ai_config(config_id: str, actor: Actor = Depends(admin), conn=Depends(db)):
    AIConfigRepository(conn).activate(admin_id=actor.id, ai_config_id=config_id)


@router.get("/admin/ai-usage")
def ai_usage(days: int = 1, actor: Actor = Depends(admin), conn=Depends(db)) -> list[dict]:
    since = iso(datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 90))))
    return AIConfigRepository(conn).usage_summary(admin_id=actor.id, since=since)


@router.post("/erasure-requests/{request_id}/approve")
def approve_erasure(request_id: str, actor: Actor = Depends(admin), conn=Depends(db)) -> dict:
    return {"status": ErasureRepository(conn).approve(request_id=request_id, approver_id=actor.id)["status"]}


@router.post("/erasure-requests/{request_id}/reject")
def reject_erasure(request_id: str, actor: Actor = Depends(admin), conn=Depends(db)) -> dict:
    return {"status": ErasureRepository(conn).reject(request_id=request_id, approver_id=actor.id)["status"]}


@router.post("/erasure-requests/{request_id}/execute")
def execute_erasure(request_id: str, actor: Actor = Depends(admin), conn=Depends(db),
                    c: AppContext = Depends(ctx)) -> dict:
    r = ErasureRepository(conn, ledger_path=c.settings.erasure_ledger_path).execute(
        request_id=request_id, executor_id=actor.id)
    return {"status": r["status"], "summary": r["summary"]}
