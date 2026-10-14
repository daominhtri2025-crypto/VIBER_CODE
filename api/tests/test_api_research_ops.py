"""Research workflow, CSV export, erasure + encrypted backup/restore replay, Claude adapter contract."""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from cryptography.fernet import Fernet

from app.domain.tutor_ai import Purpose, TutorAIError, TutorContext
from app.infrastructure import backup as bk
from app.infrastructure.ai.claude import API_URL, API_VERSION, ClaudeTutorAI
from app.infrastructure.sqlite.repositories import ReportRepository
from tests.api_fixtures import build_env

API = "/api/v1"


def csv_rows(text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))


# ------------------------------------------------------------------ study
def test_full_study_cycle_blind_grading_publication_and_export(env):
    nc, hs = env.headers("researcher-demo"), env.headers("student-b")
    study = env.client.post(f"{API}/studies", json={"title": "Thực nghiệm HK1"}, headers=nc).json()
    g = env.client.post(f"{API}/studies/{study['id']}/groups", json={"name": "AI", "condition": "ai_guided"},
                        headers=nc).json()
    part = env.client.post(f"{API}/studies/{study['id']}/participants",
                           json={"student_id": "student-b", "group_id": g["id"]}, headers=nc).json()
    assert part["participant_code"].startswith("P-")
    now = datetime.now(timezone.utc)
    a = env.client.post(f"{API}/studies/{study['id']}/assessments", headers=nc, json={
        "title": "Kiểm tra sau", "phase": "post", "rubric_version": "rubric-v1",
        "opens_at": (now - timedelta(hours=1)).isoformat(), "closes_at": (now + timedelta(hours=1)).isoformat(),
        "items": [{"problem_id": "p3", "problem_version": 1, "max_solution_score": 7, "max_explanation_score": 3}]})
    assert a.status_code == 201, a.text
    att = env.client.post(f"{API}/assessments/{a.json()['id']}/attempts", headers=hs).json()
    items = env.client.get(f"{API}/attempts/{att['id']}/items", headers=hs).json()
    assert "teacher_solution" not in json.dumps(items)
    env.client.put(f"{API}/attempts/{att['id']}/items/{items[0]['item_id']}", headers=hs,
                   json={"solution": "x=6", "explanation": "chuyển vế"})
    sub = env.client.post(f"{API}/attempts/{att['id']}/submit", headers=hs).json()
    assert set(sub) == {"id", "submitted_at"}  # no correctness before publication
    assert env.client.get(f"{API}/attempts/{att['id']}/result", headers=hs).status_code == 409

    queue = env.client.get(f"{API}/studies/{study['id']}/responses", headers=nc).json()
    assert len(queue) == 1 and "condition" not in queue[0] and "student_id" not in queue[0]  # blind
    export = csv_rows(env.client.get(f"{API}/studies/{study['id']}/export", headers=nc).text)
    assert export[0]["total_score"] == ""  # NULL (not graded) is not 0
    env.client.patch(f"{API}/responses/{queue[0]['response_id']}/grade", headers=nc,
                     json={"solution_score": 7, "explanation_score": 2})
    export = csv_rows(env.client.get(f"{API}/studies/{study['id']}/export", headers=nc).text)
    assert export[0]["total_score"] == "9.0" and export[0]["participant_code"] == part["participant_code"]
    raw = env.client.get(f"{API}/studies/{study['id']}/export", headers=nc).text
    for ident in ("student-b", "Học sinh mẫu B", "hs.b"):
        assert ident not in raw

    assert env.client.post(f"{API}/assessments/{a.json()['id']}/publish", headers=nc).status_code == 204
    res = env.client.get(f"{API}/attempts/{att['id']}/result", headers=hs).json()
    assert res["total_score"] == 9 and "teacher_solution" not in json.dumps(res)


def test_assessment_window_enforced(env):
    nc, hs = env.headers("researcher-demo"), env.headers("student-a")
    now = datetime.now(timezone.utc)
    a = env.client.post(f"{API}/studies/study-demo/assessments", headers=nc, json={
        "title": "Chưa mở", "phase": "retention", "rubric_version": "rubric-v1",
        "opens_at": (now + timedelta(days=1)).isoformat(),
        "items": [{"problem_id": "p2", "problem_version": 1, "max_solution_score": 7, "max_explanation_score": 3}]})
    r = env.client.post(f"{API}/assessments/{a.json()['id']}/attempts", headers=hs)
    assert r.status_code == 409 and "not open" in r.json()["message"]


def test_process_export_uses_only_study_linked_sessions(env):
    nc = env.headers("researcher-demo")
    hs = env.headers("student-b")
    s = env.client.post(f"{API}/sessions", json={"assignment_id": "assignment-demo", "problem_id": "p3",
                                                  "problem_version": 1}, headers=hs).json()
    with env.conn() as c:  # student-b is in exactly one running study -> session linked automatically
        assert c.execute("SELECT study_id FROM learning_sessions WHERE id=?",
                         (s["session_id"],)).fetchone()[0] == "study-demo"
    rows = csv_rows(env.client.get(f"{API}/studies/study-demo/export/process", headers=nc).text)
    assert {r["participant_code"] for r in rows} == {"P001", "P002"}
    assert set(rows[0]) == {"participant_code", "condition", "sessions", "steps", "invalid_steps", "unknown_steps",
                            "hints_requested", "hints_offered", "max_hint_level", "active_minutes"}


def test_active_time_rules(env):
    with env.conn() as c:
        c.execute("BEGIN IMMEDIATE")
        c.execute("INSERT INTO learning_sessions(id, student_id, problem_id, problem_version, learning_mode)"
                  " VALUES('t','student-b','p2',1,'practice')")
        for i, (ev, t) in enumerate([("start", "10:00:00"), ("heartbeat", "10:02:00"), ("pause", "10:03:00"),
                                     ("resume", "10:30:00"), ("heartbeat", "10:31:00"), ("heartbeat", "11:00:00"),
                                     ("submit", "11:01:00")]):
            c.execute("INSERT INTO activity_events(id, session_id, event_type, occurred_at) VALUES(?,?,?,?)",
                      (f"e{i}", "t", ev, f"2026-10-14T{t}.000Z"))
        c.execute("COMMIT")
        # 120 + 60 (until pause) + [pause gap skipped] + 60 + [29 min idle skipped] + 60 = 300 s
        assert ReportRepository(c).active_seconds("t") == 300


# ---------------------------------------------------------------- AI admin
def test_ai_config_admin(env):
    a = env.headers("admin-demo")
    bad = env.client.post(f"{API}/admin/ai-configs", headers=a, json={
        "provider": "anthropic", "model_name": "claude-haiku-5-5", "prompt_version": "tutor-system-v1",
        "parameters": {"api_key": "sk-ant-..."}})
    assert bad.status_code == 422  # keys never stored in ai_configs
    missing_prompt = env.client.post(f"{API}/admin/ai-configs", headers=a, json={
        "provider": "anthropic", "model_name": "claude-haiku-5-5", "prompt_version": "tutor-system-v9"})
    assert missing_prompt.status_code == 404
    ok = env.client.post(f"{API}/admin/ai-configs", headers=a, json={
        "provider": "anthropic", "model_name": "claude-haiku-5-5", "prompt_version": "tutor-system-v1",
        "parameters": {"max_output_tokens": 300, "price_input_per_mtok": 0.10, "price_output_per_mtok": 0.50}})
    assert ok.status_code == 201
    assert env.client.post(f"{API}/admin/ai-configs/{ok.json()['id']}/activate", headers=a).status_code == 204
    assert isinstance(env.client.get(f"{API}/admin/ai-usage", headers=a).json(), list)


# ------------------------------------------------- erasure + backup/restore
def test_erasure_survives_restore_from_older_backup(tmp_path):
    key = Fernet.generate_key().decode()
    e = build_env(tmp_path, backup_key=key)
    marker = "Em trừ 5 ở hai vế"  # student-a's seeded explanation
    old_backup = bk.create_encrypted_backup(e.db_path, e.settings.backup_dir, key)
    assert marker.encode() not in old_backup.read_bytes()  # encrypted at rest

    req = e.client.post(f"{API}/erasure-requests", headers=e.headers("researcher-demo"),
                        json={"subject_user_id": "student-a", "reason": "Phụ huynh rút đồng ý"}).json()
    assert e.client.post(f"{API}/erasure-requests/{req['id']}/approve", headers=e.headers("admin-demo")).status_code == 200
    done = e.client.post(f"{API}/erasure-requests/{req['id']}/execute", headers=e.headers("admin-demo")).json()
    assert done["status"] == "executed"
    assert e.settings.erasure_ledger_path.read_text(encoding="utf-8").count(req["id"]) == 1

    restored = tmp_path / "restored.db"
    result = bk.restore_backup(old_backup, restored, key, e.settings.erasure_ledger_path)
    assert result["erasures_replayed"] == [req["id"]] and result["health"]["ok"]
    from app.infrastructure.sqlite.connection import connect
    c = connect(restored)
    try:
        assert c.execute("SELECT count(*) FROM learning_sessions WHERE student_id='student-a'").fetchone()[0] == 0
        assert c.execute("SELECT status FROM erasure_requests WHERE id=?", (req["id"],)).fetchone()[0] == "executed"
    finally:
        c.close()
    assert marker.encode() not in restored.read_bytes()


def test_backup_retention_and_wrong_key(tmp_path):
    key = Fernet.generate_key().decode()
    e = build_env(tmp_path, backup_key=key)
    now = datetime.now(timezone.utc)
    old = bk.create_encrypted_backup(e.db_path, e.settings.backup_dir, key, now=now - timedelta(days=31))
    fresh = bk.create_encrypted_backup(e.db_path, e.settings.backup_dir, key, now=now)
    assert bk.prune_backups(e.settings.backup_dir, 30, now=now) == [old] and fresh.exists()
    with pytest.raises(bk.BackupError, match="decrypted"):
        bk.restore_backup(fresh, tmp_path / "x.db", Fernet.generate_key().decode(), None)
    with pytest.raises(bk.BackupError, match="BACKUP_KEY"):
        bk.create_encrypted_backup(e.db_path, e.settings.backup_dir, None)


# ------------------------------------------------------ Claude adapter contract
CTX = TutorContext(purpose=Purpose.STEP_FEEDBACK, state="SOLVE_STEP", problem_statement="Giải 2x + 5 = 17",
                   current_equation="2*x+5=17", submitted_equation="2x=22", operation="subtract_both_sides",
                   math_status="invalid", error_code="SIGN_ERROR", allowed_hint_level=0,
                   template_feedback="Có một dấu chưa đúng.", template_question="Dấu thay đổi thế nào?")


def _adapter(handler):
    return ClaudeTutorAI("sk-test", client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_claude_request_shape_and_parsing():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"], seen["headers"], seen["body"] = str(request.url), request.headers, json.loads(request.content)
        return httpx.Response(200, json={
            "content": [{"type": "text", "text": json.dumps({"feedback": "Em xem lại dấu nhé.", "question":
                         "Khi chuyển vế, dấu đổi thế nào?", "hint_level": 0, "needs_teacher_review": False})}],
            "stop_reason": "end_turn", "usage": {"input_tokens": 410, "output_tokens": 52}})

    call = _adapter(handler).generate(CTX, model="claude-haiku-5-5", system_prompt="SYS", timeout=5,
                                      max_output_tokens=300)
    assert seen["url"] == API_URL and seen["headers"]["x-api-key"] == "sk-test"
    assert seen["headers"]["anthropic-version"] == API_VERSION
    body = seen["body"]
    assert body["model"] == "claude-haiku-5-5" and body["system"] == "SYS" and body["max_tokens"] == 300
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert (call.input_tokens, call.output_tokens) == (410, 52) and call.output.hint_level == 0


@pytest.mark.parametrize("response, kind", [
    (httpx.Response(529, json={"type": "error"}), "transport"),
    (httpx.Response(429, json={"type": "error"}), "transport"),
    (httpx.Response(200, json={"content": [{"type": "text", "text": "not json"}], "stop_reason": "end_turn"}),
     "bad_output"),
    (httpx.Response(200, json={"content": [], "stop_reason": "refusal"}), "refusal"),
])
def test_claude_errors_map_to_fallback_kinds(response, kind):
    with pytest.raises(TutorAIError) as exc:
        _adapter(lambda r: response).generate(CTX, model="m", system_prompt="s", timeout=1, max_output_tokens=10)
    assert exc.value.kind == kind


def test_claude_timeout():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)
    with pytest.raises(TutorAIError) as exc:
        _adapter(handler).generate(CTX, model="m", system_prompt="s", timeout=0.1, max_output_tokens=10)
    assert exc.value.kind == "timeout"


def test_guided_assignment_requires_catalogue(env):
    t = env.headers("teacher-demo")
    pid = env.client.post(f"{API}/problems", json={"topic_id": "linear-equations"}, headers=t).json()["id"]
    env.client.post(f"{API}/problems/{pid}/versions", headers=t, json={
        "statement": "Giải 5x - 2 = 13", "math_spec": {"variable": "x", "domain": "R", "lhs": "5*x-2", "rhs": "13"},
        "teacher_solution": "x=3", "hints": ["a", "b", "c"], "difficulty": "easy"})
    env.client.post(f"{API}/problems/{pid}/versions/1/approve", headers=t)
    body = {"class_id": "class-demo", "title": "Bài mới", "learning_mode": "guided",
            "problems": [{"problem_id": pid, "problem_version": 1}]}
    r = env.client.post(f"{API}/assignments", json=body, headers=t)
    assert r.status_code == 422 and r.json()["detail"]["missing_catalogue"] == [f"{pid}@1"]
    assert env.client.post(f"{API}/assignments", json=body | {"learning_mode": "practice"}, headers=t).status_code == 201
