"""Authentication & authorisation (handoff §7 GĐ3 acceptance: identity, roles, scopes)."""
from __future__ import annotations

import jwt
import pytest

from tests.api_fixtures import PASSWORD, build_env

API = "/api/v1"


def test_login_and_me(env):
    me = env.client.get(f"{API}/me", headers=env.headers("student-a")).json()
    assert me["id"] == "student-a" and me["roles"] == ["student"] and me["username"] == "hs.a"


def test_wrong_password_is_generic_and_locks_after_five(env):
    msgs = set()
    for _ in range(5):
        r = env.client.post(f"{API}/auth/login", json={"username": "hs.b", "password": "sai-mat-khau"})
        assert r.status_code == 401
        msgs.add(r.json()["message"])
    unknown = env.client.post(f"{API}/auth/login", json={"username": "khong-ton-tai", "password": "x"})
    assert unknown.json()["message"] in msgs  # no account enumeration
    locked = env.client.post(f"{API}/auth/login", json={"username": "hs.b", "password": PASSWORD})
    assert locked.status_code == 401  # correct password refused while locked


_CLAIMS = {"sub": "admin-demo", "iss": "math-tutor-api", "typ": "access", "iat": 1, "exp": 4102444800}


@pytest.mark.parametrize("token", [
    "not-a-jwt",
    jwt.encode(_CLAIMS, "wrong-secret-wrong-secret-wrong-secret!!", algorithm="HS256"),    # forged signature
    jwt.encode(_CLAIMS, None, algorithm="none"),                                          # alg=none
    jwt.encode(_CLAIMS | {"typ": "refresh"}, "t" * 40, algorithm="HS256"),                # wrong token type
    jwt.encode(_CLAIMS | {"exp": 2}, "t" * 40, algorithm="HS256"),                        # expired
])
def test_forged_tokens_rejected(env, token):
    assert env.client.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_missing_token(env):
    assert env.client.get(f"{API}/assignments").status_code == 401


def test_disabled_user_loses_access_immediately(env):
    h = env.headers("student-b")
    r = env.client.patch(f"{API}/admin/users/student-b/status", json={"status": "disabled"},
                         headers=env.headers("admin-demo"))
    assert r.status_code == 200
    assert env.client.get(f"{API}/me", headers=h).status_code == 401


def test_refresh_rotation_and_reuse_detection(env):
    pair = env.client.post(f"{API}/auth/login", json={"username": "hs.a", "password": PASSWORD}).json()
    new = env.client.post(f"{API}/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert new.status_code == 200
    reuse = env.client.post(f"{API}/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert reuse.status_code == 401
    # the whole family is now revoked, including the token issued by the legitimate rotation
    assert env.client.post(f"{API}/auth/refresh", json={"refresh_token": new.json()["refresh_token"]}).status_code == 401


def test_logout_revokes_refresh(env):
    pair = env.client.post(f"{API}/auth/login", json={"username": "hs.a", "password": PASSWORD}).json()
    assert env.client.post(f"{API}/auth/logout", json={"refresh_token": pair["refresh_token"]}).status_code == 204
    assert env.client.post(f"{API}/auth/refresh", json={"refresh_token": pair["refresh_token"]}).status_code == 401


# ------------------------------------------------------------------ Google
def test_google_links_only_preregistered_email(env):
    stranger = env.google_token(sub="g-999", email="nguoi.la@gmail.com")
    assert env.client.post(f"{API}/auth/google", json={"id_token": stranger}).status_code == 401
    with env.conn() as c:
        assert c.execute("SELECT count(*) FROM users").fetchone()[0] == 5  # nothing auto-provisioned
    ok = env.client.post(f"{API}/auth/google", json={"id_token": env.google_token(sub="g-1",
                                                                                   email="HS.A@example.edu.vn")})
    assert ok.status_code == 200
    me = env.client.get(f"{API}/me", headers={"Authorization": f"Bearer {ok.json()['access_token']}"}).json()
    assert me["id"] == "student-a" and me["google_linked"]
    # subsequent login works via the linked subject even if the Google email changes
    again = env.client.post(f"{API}/auth/google", json={"id_token": env.google_token(sub="g-1", email="moi@gmail.com")})
    assert again.status_code == 200


@pytest.mark.parametrize("kw", [dict(verified=False), dict(aud="other-client"), dict(iss="https://evil.example")])
def test_google_token_claims_enforced(env, kw):
    t = env.google_token(sub="g-2", email="hs.a@example.edu.vn", **kw)
    assert env.client.post(f"{API}/auth/google", json={"id_token": t}).status_code == 401


def test_google_domain_allowlist_is_configurable(tmp_path):
    e = build_env(tmp_path, google_allowed_domains=("fpt.edu.vn",))
    t = e.google_token(sub="g-3", email="hs.a@example.edu.vn")
    assert e.client.post(f"{API}/auth/google", json={"id_token": t}).status_code == 401


def test_explicit_link_while_logged_in(env):
    t = env.google_token(sub="g-b", email="ca.nhan@gmail.com")
    assert env.client.post(f"{API}/auth/google/link", json={"id_token": t},
                           headers=env.headers("student-b")).status_code == 204
    assert env.client.post(f"{API}/auth/google", json={"id_token": t}).status_code == 200


# ---------------------------------------------------------- account admin
def test_teacher_creates_students_only(env):
    body = {"display_name": "HS mới", "roles": ["student"], "username": "hs.moi", "initial_password": "abcdefgh1"}
    assert env.client.post(f"{API}/users", json=body, headers=env.headers("teacher-demo")).status_code == 201
    body |= {"username": "gv.moi", "roles": ["teacher"]}
    assert env.client.post(f"{API}/users", json=body, headers=env.headers("teacher-demo")).status_code == 403
    assert env.client.post(f"{API}/users", json=body, headers=env.headers("admin-demo")).status_code == 201
    login = env.client.post(f"{API}/auth/login", json={"username": "hs.moi", "password": "abcdefgh1"}).json()
    me = env.client.get(f"{API}/me", headers={"Authorization": f"Bearer {login['access_token']}"}).json()
    assert me["must_change_password"] is True


# ------------------------------------------------------------- authorisation
@pytest.mark.parametrize("user, method, path, status", [
    ("student-a", "get", "/classes/class-demo/report", 403),        # wrong role
    ("researcher-demo", "get", "/assignments", 403),
    ("admin-demo", "get", "/studies/study-demo/export", 403),        # admin has no research export by default
    ("admin-demo", "patch", "/responses/response-a-pre/grade", 403),  # nor grading rights
    ("student-a", "post", "/admin/ai-configs", 403),
])
def test_role_gates(env, user, method, path, status):
    assert getattr(env.client, method)(f"{API}{path}", headers=env.headers(user)).status_code == status


def test_student_cannot_read_other_students_session(env):
    r = env.client.post(f"{API}/sessions", json={"assignment_id": "assignment-demo", "problem_id": "p3",
                                                  "problem_version": 1}, headers=env.headers("student-b"))
    sid = r.json()["session_id"]
    assert env.client.get(f"{API}/sessions/{sid}", headers=env.headers("student-a")).status_code == 404
    assert env.client.post(f"{API}/sessions/{sid}/hints", json={"request_id": "x"},
                           headers=env.headers("student-a")).status_code == 404


def test_teacher_of_other_class_sees_nothing(env):
    admin = env.headers("admin-demo")
    env.client.post(f"{API}/users", json={"display_name": "GV 2", "roles": ["teacher"], "username": "gv.hai",
                                          "initial_password": "abcdefgh2"}, headers=admin)
    tok = env.client.post(f"{API}/auth/login", json={"username": "gv.hai", "password": "abcdefgh2"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert env.client.get(f"{API}/classes/class-demo/report", headers=h).status_code == 404
    assert env.client.get(f"{API}/teacher/sessions/session-demo", headers=h).status_code == 404


def test_researcher_of_other_study_cannot_export(env):
    admin = env.headers("admin-demo")
    env.client.post(f"{API}/users", json={"display_name": "NC 2", "roles": ["researcher"], "username": "nc.hai",
                                          "initial_password": "abcdefgh3"}, headers=admin)
    tok = env.client.post(f"{API}/auth/login", json={"username": "nc.hai", "password": "abcdefgh3"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert env.client.get(f"{API}/studies/study-demo/export", headers=h).status_code == 404


@pytest.mark.parametrize("extra", [{"actor_id": "teacher-demo"}, {"math_status": "valid"}, {"role": "admin"},
                                   {"previous_equation": "x=6"}])
def test_body_cannot_smuggle_identity_or_verdict(env, extra):
    r = env.client.post(f"{API}/sessions", json={"assignment_id": "assignment-demo", "problem_id": "p3",
                                                  "problem_version": 1}, headers=env.headers("student-b")).json()
    body = {"request_id": "s1", "expected_version": r["session_version"], "submitted_equation": "x=6",
            "operation": "divide_both_sides", "operation_value": "2"} | extra
    assert env.client.post(f"{API}/sessions/{r['session_id']}/steps", json=body,
                           headers=env.headers("student-b")).status_code == 422
