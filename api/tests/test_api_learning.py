"""Learning flow over HTTP with the AI layer (mock): fallback, guard, quota, PII, idempotency."""
from __future__ import annotations

import pytest

from app.domain.tutor_ai import TutorOutput
from app.infrastructure.ai.mock import MockTutorAI
from tests.api_fixtures import build_env, rid

API = "/api/v1"
STUDENT = "student-b"


class Client:
    def __init__(self, e, user=STUDENT):
        self.e, self.h, self.r = e, e.headers(user), None

    def start(self, problem="p1"):
        r = self.e.client.post(f"{API}/sessions", json={"assignment_id": "assignment-demo", "problem_id": problem,
                                                        "problem_version": 1}, headers=self.h)
        assert r.status_code == 201, r.text
        self.r = r.json()
        return self.r

    def post(self, path, body, *, versioned=True, expect=200):
        if versioned:
            body = {"request_id": rid(), "expected_version": self.r["session_version"]} | body
        resp = self.e.client.post(f"{API}/sessions/{self.r['session_id']}/{path}", json=body, headers=self.h)
        assert resp.status_code == expect, resp.text
        if expect == 200:
            self.r = resp.json()
        return resp

    def to_solving(self):
        self.start()
        self.post("read", {"restatement": "Tìm x"})
        self.post("knowledge", {"option_id": "k-transpose"})
        self.post("plan", {"option_id": "pl-transpose-5"})
        assert self.r["state"] == "SOLVE_STEP"
        return self

    def step(self, eq, op, val=None, **kw):
        return self.post("steps", {"submitted_equation": eq, "operation": op, "operation_value": val} | kw)


def usage(e):
    with e.conn() as c:
        return [r[0] for r in c.execute("SELECT outcome FROM ai_usage ORDER BY rowid")]


# --------------------------------------------------------------- happy path
def test_full_flow_with_ai_phrasing_and_disclosure(env):
    c = Client(env).to_solving()
    r = c.step("2x=22", "subtract_both_sides", "5").json()
    assert r["math_status"] == "invalid" and r["error_code"] == "SIGN_ERROR"
    assert r["ai_generated"] and r["feedback"].startswith("[AI]") and r["ai_disclosure"]
    c.step("2x=12", "transpose_term", "+5")
    c.step("x=6", "divide_both_sides", "2")
    r = c.post("verify", {"substitution": "2·6+5=17"}).json()
    assert r["state"] == "INDEPENDENT_PRACTICE" and r["next_session_id"]
    assert usage(env).count("ok") == 4
    with env.conn() as conn:  # AI message stored with the frozen config id
        n = conn.execute("SELECT count(*) FROM messages WHERE session_id=? AND sender_type='assistant'"
                         " AND ai_config_id IS NOT NULL", (c.r["session_id"],)).fetchone()[0]
    assert n == 4


def test_hint_rephrased_but_level_policy_kept(env):
    c = Client(env).to_solving()
    r = c.post("hints", {"request_id": rid("h")}, versioned=False).json()
    assert r["hint_level"] == 1 and r["hint"].startswith("[AI]")


# ----------------------------------------------------------------- retries
def test_retry_returns_identical_body_including_ai_text(env):
    c = Client(env).to_solving()
    body = {"request_id": "same-1", "expected_version": c.r["session_version"], "submitted_equation": "2x=13",
            "operation": "subtract_both_sides", "operation_value": "5"}
    url = f"{API}/sessions/{c.r['session_id']}/steps"
    a = env.client.post(url, json=body, headers=c.h)
    b = env.client.post(url, json=body, headers=c.h)
    assert a.json() == b.json() and b.headers.get("Idempotent-Replay") == "true"
    assert usage(env).count("ok") == 1  # AI called once
    with env.conn() as conn:
        assert conn.execute("SELECT count(*) FROM solution_steps WHERE request_id='same-1'").fetchone()[0] == 1
    changed = env.client.post(url, json=body | {"submitted_equation": "2x=12"}, headers=c.h)
    assert changed.status_code == 409


def test_version_conflict_is_409(env):
    c = Client(env).to_solving()
    resp = env.client.post(f"{API}/sessions/{c.r['session_id']}/steps", headers=c.h, json={
        "request_id": "old", "expected_version": 0, "submitted_equation": "2x=12",
        "operation": "subtract_both_sides", "operation_value": "5"})
    assert resp.status_code == 409 and resp.json()["error"] == "VERSION_CONFLICT"


# --------------------------------------------------------- fallback & guard
@pytest.mark.parametrize("behaviour, outcome", [("timeout", "fallback_timeout"), ("error", "fallback_error"),
                                                ("garbage", "fallback_error")])
def test_ai_failure_falls_back_without_losing_the_step(tmp_path, behaviour, outcome):
    e = build_env(tmp_path, tutor=MockTutorAI(behaviour))
    c = Client(e).to_solving()
    r = c.step("2x=22", "subtract_both_sides", "5").json()
    assert r["ai_generated"] is False and r["feedback"] == "Có một dấu chưa đúng trong bước này."
    assert usage(e) == [outcome]
    with e.conn() as conn:
        assert conn.execute("SELECT count(*) FROM solution_steps WHERE session_id=?",
                            (c.r["session_id"],)).fetchone()[0] == 1


@pytest.mark.parametrize("feedback, question, level, violation", [
    ("Vậy x = 6 nhé.", "Em kiểm tra lại chứ?", 0, "answer_leak"),
    ("Đáp số là 6.", "Em thấy sao?", 0, "answer_leak"),
    ("Đúng rồi, em làm tốt!", "Bước tiếp theo là gì?", 0, "contradicts_mathchecker_affirms"),
    ("Xem thêm tại https://example.com", "Em đọc nhé?", 0, "contact_or_link"),
    ("Em xem lại dấu.", "Vì sao? Thế nào?", 0, "more_than_one_question"),
    ("Em xem lại dấu.", "Em thử lại nhé?", 3, "hint_level_exceeds_policy"),
    ("x" * 400, "Em thử lại?", 0, "feedback_too_long"),
])
def test_output_guard_rejects_unsafe_ai(tmp_path, feedback, question, level, violation):
    e = build_env(tmp_path, tutor=MockTutorAI(lambda ctx: TutorOutput(feedback, question, level, False)))
    c = Client(e).to_solving()
    r = c.step("2x=22", "subtract_both_sides", "5").json()
    assert r["ai_generated"] is False and r["feedback"] == "Có một dấu chưa đúng trong bước này."
    with e.conn() as conn:
        detail = conn.execute("SELECT outcome, detail FROM ai_usage").fetchone()
    assert detail[0] == "fallback_invalid" and violation in detail[1]


def test_ai_cannot_change_state_or_verdict(tmp_path):
    """Even a 'helpful' AI output cannot move the session: state comes from MathChecker only."""
    e = build_env(tmp_path, tutor=MockTutorAI(lambda ctx: TutorOutput(
        "Em hãy xem lại phép tính.", "Em chuyển sang bước kiểm tra nghiệm nhé?", 0, False)))
    c = Client(e).to_solving()
    r = c.step("2x=13", "subtract_both_sides", "5").json()
    assert r["state"] == "SOLVE_STEP" and r["math_status"] == "invalid"


def test_stale_ai_reply_discarded(tmp_path):
    holder = {}

    def concurrent_write(ctx):
        with holder["e"].conn() as conn:  # another request moves the session while AI is "thinking"
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("UPDATE learning_sessions SET version=version+1 WHERE id=?", (holder["sid"],))
            conn.execute("COMMIT")
        return TutorOutput("Em xem lại nhé.", "Em thử lại?", 0, False)

    e = build_env(tmp_path, tutor=MockTutorAI(concurrent_write))
    holder["e"] = e
    c = Client(e).to_solving()
    holder["sid"] = c.r["session_id"]
    r = c.step("2x=22", "subtract_both_sides", "5").json()
    assert r["ai_generated"] is False and usage(e) == ["skipped_stale"]


# ------------------------------------------------------------ quota/budget
def test_session_quota_then_templates(tmp_path):
    e = build_env(tmp_path, ai_quota_per_session=2)
    c = Client(e).to_solving()
    flags = [c.step(f"2x={n}", "subtract_both_sides", "5").json()["ai_generated"] for n in (13, 14, 15)]
    assert flags == [True, True, False] and usage(e)[-1] == "skipped_quota"


def test_daily_quota_counts_across_sessions(tmp_path):
    e = build_env(tmp_path, ai_quota_per_student_per_day=1)
    c = Client(e).to_solving()
    assert c.step("2x=13", "subtract_both_sides", "5").json()["ai_generated"]
    assert not c.step("2x=14", "subtract_both_sides", "5").json()["ai_generated"]


def test_budget_cap(tmp_path):
    e = build_env(tmp_path, ai_daily_budget_usd=0.0)
    c = Client(e).to_solving()
    assert not c.step("2x=13", "subtract_both_sides", "5").json()["ai_generated"]
    assert usage(e) == ["skipped_budget"]


def test_ai_disabled_globally(tmp_path):
    e = build_env(tmp_path, ai_enabled=False)
    c = Client(e).to_solving()
    assert not c.step("2x=13", "subtract_both_sides", "5").json()["ai_generated"]
    assert e.tutor.calls == []


# ---------------------------------------------------------------- privacy
def test_no_pii_or_free_text_reaches_the_model(env):
    c = Client(env).to_solving()
    c.step("2x=22", "subtract_both_sides", "5", explanation="Em là Nguyễn Văn B, lớp 8A, sđt 0912345678")
    c.step("2x = 12 em tên là Bình", "subtract_both_sides", "5")  # unknown input with free text
    blob = " ".join(str(v) for ctx in env.tutor.calls for v in ctx.__dict__.values())
    for secret in ("student-b", "Học sinh mẫu B", "Nguyễn Văn B", "0912345678", "Bình"):
        assert secret not in blob
    assert env.tutor.calls[-1].submitted_equation is None  # unknown input never forwarded


# -------------------------------------------------------- independent mode
def test_independent_mode_never_calls_ai(env):
    c = Client(env).to_solving()
    c.step("2x=12", "transpose_term", "+5")
    c.step("x=6", "divide_both_sides", "2")
    child = c.post("verify", {"substitution": "2·6+5=17"}).json()["next_session_id"]
    calls_before = len(env.tutor.calls)
    view = env.client.get(f"{API}/sessions/{child}", headers=c.h).json()
    resp = env.client.post(f"{API}/sessions/{child}/steps", headers=c.h, json={
        "request_id": "ind-1", "expected_version": view["session_version"], "submitted_equation": "3x=7",
        "operation": "transpose_term", "operation_value": "-4"}).json()
    assert resp["math_status"] is None and resp["error_code"] is None and not resp["ai_generated"]
    assert env.client.post(f"{API}/sessions/{child}/hints", json={"request_id": "ih"}, headers=c.h).status_code == 409
    assert len(env.tutor.calls) == calls_before


def test_responses_never_expose_internal_content(env):
    c = Client(env).to_solving()
    texts = [c.step("2x=13", "subtract_both_sides", "5").text,
             c.post("hints", {"request_id": rid("h")}, versioned=False).text,
             env.client.get(f"{API}/sessions/{c.r['session_id']}", headers=c.h).text,
             env.client.get(f"{API}/assignments", headers=c.h).text,
             env.client.get(f"{API}/sessions/{c.r['session_id']}/messages", headers=c.h).text]
    for t in texts:
        assert "teacher_solution" not in t and "Chia hai vế cho 2 được x=6" not in t


# ------------------------------------------------------- feedback reports
def test_student_reports_ai_message_and_teacher_resolves(env):
    c = Client(env).to_solving()
    mid = c.step("2x=22", "subtract_both_sides", "5").json()["ai_message_id"]
    assert env.client.post(f"{API}/feedback-reports", json={"message_id": mid, "reason": "Khó hiểu"},
                           headers=env.headers("student-a")).status_code == 404  # not their message
    rep = env.client.post(f"{API}/feedback-reports", json={"message_id": mid, "reason": "Khó hiểu"}, headers=c.h)
    assert rep.status_code == 201
    t = env.headers("teacher-demo")
    listed = env.client.get(f"{API}/feedback-reports?status=open", headers=t).json()
    assert [r["id"] for r in listed] == [rep.json()["id"]]
    done = env.client.patch(f"{API}/feedback-reports/{rep.json()['id']}", headers=t,
                            json={"status": "resolved", "resolution": "Đã sửa template"})
    assert done.json()["status"] == "resolved"


def test_teacher_report_shows_needs_teacher_flags_and_time(env):
    c = Client(env).to_solving()
    for _ in range(3):
        c.post("hints", {"request_id": rid("h")}, versioned=False)
    c.step("2x=13", "subtract_both_sides", "5")
    rep = env.client.get(f"{API}/classes/class-demo/report", headers=env.headers("teacher-demo")).json()
    assert rep["needs_teacher"].get(c.r["session_id"]) == 1
    assert all("active_minutes" in s for s in rep["sessions"])
