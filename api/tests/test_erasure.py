"""Migration 0003 + ErasureRepository: two-person rule, complete hard delete, audit kept (D5/Q10)."""
from __future__ import annotations

import sqlite3

import pytest

from app.domain.errors import IntegrityViolation, NotFound, PermissionDenied, StateConflict
from app.infrastructure.sqlite.repositories import AssessmentRepository, ErasureRepository, UserRepository
from tests.conftest import raw_exec

SUBJECT = "student-a"  # seed: session-demo (2 steps, 1 hint, 1 message, 1 event), participant P001, graded pre-test


@pytest.fixture
def admins(conn):
    users = UserRepository(conn)
    users.create(display_name="Quản trị 2", roles=["admin"], user_id="admin-2")
    return "admin-demo", "admin-2"


def counts(conn, student):
    q = {
        "sessions": "SELECT count(*) FROM learning_sessions WHERE student_id=?",
        "steps": "SELECT count(*) FROM solution_steps t JOIN learning_sessions s ON s.id=t.session_id WHERE s.student_id=?",
        "hints": "SELECT count(*) FROM hint_events h JOIN learning_sessions s ON s.id=h.session_id WHERE s.student_id=?",
        "participants": "SELECT count(*) FROM study_participants WHERE student_id=?",
        "attempts": "SELECT count(*) FROM assessment_attempts a JOIN study_participants p ON p.id=a.participant_id"
                    " WHERE p.student_id=?",
    }
    return {k: conn.execute(sql, (student,)).fetchone()[0] for k, sql in q.items()}


def test_full_two_person_flow_deletes_everything_for_subject_only(conn, admins):
    repo = ErasureRepository(conn)
    before_other = counts(conn, "student-b")
    assert counts(conn, SUBJECT)["steps"] == 2 and counts(conn, SUBJECT)["attempts"] == 1
    req = repo.request(requester_id="researcher-demo", subject_user_id=SUBJECT, reason="Phụ huynh rút đồng ý")
    repo.approve(request_id=req["id"], approver_id=admins[0])
    done = repo.execute(request_id=req["id"], executor_id=admins[0])
    assert done["status"] == "executed" and '"solution_steps":2' in done["summary"]
    assert all(v == 0 for v in counts(conn, SUBJECT).values())
    assert counts(conn, "student-b") == before_other
    assert conn.execute("SELECT 1 FROM users WHERE id=?", (SUBJECT,)).fetchone()  # account kept
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    actions = [r[0] for r in conn.execute("SELECT action FROM audit_log WHERE entity_id=? ORDER BY rowid", (req["id"],))]
    assert actions == ["erasure.request", "erasure.approved", "erasure.execute"]
    assert conn.execute("SELECT count(*) FROM research_results WHERE participant_code='P001'").fetchone()[0] == 0


def test_erased_text_does_not_remain_in_database_file(db_path, conn, admins):
    marker = "Em trừ 5 ở hai vế"  # explanation text of seeded step-1 (student-a)
    repo = ErasureRepository(conn)
    req = repo.request(requester_id="researcher-demo", subject_user_id=SUBJECT, reason="Rút khỏi nghiên cứu")
    repo.approve(request_id=req["id"], approver_id=admins[1])
    repo.execute(request_id=req["id"], executor_id=admins[0])
    raw = db_path.read_bytes() + (db_path.with_name(db_path.name + "-wal").read_bytes()
                                  if db_path.with_name(db_path.name + "-wal").exists() else b"")
    assert marker.encode("utf-8") not in raw


def test_requester_cannot_approve_own_request(conn, admins):
    repo = ErasureRepository(conn)
    req = repo.request(requester_id=admins[0], subject_user_id=SUBJECT, reason="Yêu cầu xóa dữ liệu")
    with pytest.raises(PermissionDenied):
        repo.approve(request_id=req["id"], approver_id=admins[0])
    with pytest.raises(sqlite3.IntegrityError, match="CHECK"):
        raw_exec(conn, "UPDATE erasure_requests SET status='approved', approved_by=requested_by,"
                       " approved_at='x' WHERE id=?", (req["id"],))
    assert repo.approve(request_id=req["id"], approver_id=admins[1])["status"] == "approved"


@pytest.mark.parametrize("requester", ["student-b", "researcher-other-study"])
def test_who_may_request(conn, requester):
    if requester == "researcher-other-study":
        UserRepository(conn).create(display_name="NC khác", roles=["researcher"], user_id="r-other")
        requester = "r-other"  # researcher, but not of the subject's study
    with pytest.raises(PermissionDenied):
        ErasureRepository(conn).request(requester_id=requester, subject_user_id=SUBJECT, reason="không hợp lệ")


def test_only_admin_executes_and_only_after_approval(conn, admins):
    repo = ErasureRepository(conn)
    req = repo.request(requester_id="researcher-demo", subject_user_id=SUBJECT, reason="Rút khỏi nghiên cứu")
    with pytest.raises(StateConflict):
        repo.execute(request_id=req["id"], executor_id=admins[0])
    repo.approve(request_id=req["id"], approver_id=admins[1])
    with pytest.raises(PermissionDenied):
        repo.execute(request_id=req["id"], executor_id="researcher-demo")
    repo.execute(request_id=req["id"], executor_id=admins[0])
    with pytest.raises(StateConflict):
        repo.execute(request_id=req["id"], executor_id=admins[0])


def test_one_open_request_per_subject_and_rejection(conn, admins):
    repo = ErasureRepository(conn)
    req = repo.request(requester_id="researcher-demo", subject_user_id=SUBJECT, reason="Lần thứ nhất")
    with pytest.raises(IntegrityViolation):
        repo.request(requester_id="researcher-demo", subject_user_id=SUBJECT, reason="Lần thứ hai")
    assert repo.reject(request_id=req["id"], approver_id=admins[0])["status"] == "rejected"
    repo.request(requester_id="researcher-demo", subject_user_id=SUBJECT, reason="Sau khi bị từ chối")


def test_submitted_attempts_still_locked_outside_erasure(conn):
    with pytest.raises(sqlite3.IntegrityError, match="cannot be deleted"):
        raw_exec(conn, "DELETE FROM assessment_attempts WHERE id='attempt-a-pre'")
    with pytest.raises(sqlite3.IntegrityError, match="locked"):
        raw_exec(conn, "DELETE FROM item_responses WHERE id='response-a-pre'")


def test_erasure_records_are_permanent(conn, admins):
    req = ErasureRepository(conn).request(requester_id=admins[0], subject_user_id=SUBJECT, reason="Kiểm tra bảo vệ")
    with pytest.raises(sqlite3.IntegrityError, match="permanent"):
        raw_exec(conn, "DELETE FROM erasure_requests WHERE id=?", (req["id"],))
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        raw_exec(conn, "UPDATE erasure_requests SET subject_user_id='student-b' WHERE id=?", (req["id"],))
    with pytest.raises(sqlite3.IntegrityError, match="transition"):
        raw_exec(conn, "UPDATE erasure_requests SET status='executing', approved_by='admin-2' WHERE id=?", (req["id"],))


def test_unknown_subject(conn):
    with pytest.raises(NotFound):
        ErasureRepository(conn).request(requester_id="admin-demo", subject_user_id="ghost", reason="không tồn tại")


def test_d6_researcher_grades_after_erasure_of_other_student(conn, admins):
    """Erasing student-a must not disturb grading of student-b."""
    a = AssessmentRepository(conn)
    att = a.start_attempt(student_id="student-b", assessment_id="post-demo")
    r = a.save_response(student_id="student-b", attempt_id=att["id"], item_id="post-item", solution="x=6")
    a.submit_attempt(student_id="student-b", attempt_id=att["id"])
    e = ErasureRepository(conn)
    req = e.request(requester_id="researcher-demo", subject_user_id=SUBJECT, reason="Rút khỏi nghiên cứu")
    e.approve(request_id=req["id"], approver_id=admins[1])
    e.execute(request_id=req["id"], executor_id=admins[0])
    assert a.grade_response(grader_id="researcher-demo", response_id=r["id"], solution_score=7,
                            explanation_score=3)["solution_score"] == 7
