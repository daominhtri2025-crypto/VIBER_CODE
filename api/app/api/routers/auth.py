"""Authentication endpoints (hybrid: local accounts + Google for existing accounts)."""
from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.deps import auth_service, current_actor
from app.api.schemas import ChangePasswordIn, GoogleIn, LoginIn, RefreshIn
from app.application.auth_service import Actor, AuthService

router = APIRouter(tags=["auth"])


@router.post("/auth/login")
def login(body: LoginIn, auth: AuthService = Depends(auth_service)) -> dict:
    return asdict(auth.login(username=body.username, password=body.password))


@router.post("/auth/google")
def google_login(body: GoogleIn, auth: AuthService = Depends(auth_service)) -> dict:
    return asdict(auth.google_login(id_token=body.id_token))


@router.post("/auth/google/link", status_code=204, response_class=Response)
def google_link(body: GoogleIn, actor: Actor = Depends(current_actor),
                auth: AuthService = Depends(auth_service)):
    auth.link_google(user_id=actor.id, id_token=body.id_token)


@router.post("/auth/refresh")
def refresh(body: RefreshIn, auth: AuthService = Depends(auth_service)) -> dict:
    return asdict(auth.refresh(refresh_token=body.refresh_token))


@router.post("/auth/logout", status_code=204, response_class=Response)
def logout(body: RefreshIn, auth: AuthService = Depends(auth_service)):
    auth.logout(refresh_token=body.refresh_token)


@router.post("/auth/password", status_code=204, response_class=Response)
def change_password(body: ChangePasswordIn, actor: Actor = Depends(current_actor),
                    auth: AuthService = Depends(auth_service)):
    auth.change_password(user_id=actor.id, old_password=body.old_password, new_password=body.new_password)


@router.get("/me")
def me(actor: Actor = Depends(current_actor), auth: AuthService = Depends(auth_service)) -> dict:
    return auth.me(actor)
