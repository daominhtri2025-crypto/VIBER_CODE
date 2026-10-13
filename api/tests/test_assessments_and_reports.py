"""Assessment lifecycle locks (migration 0002) and scoped research export."""
from __future__ import annotations

import csv
import sqlite3

import pytest

from app.domain.errors import IntegrityViolation, NotFound, PermissionDenied, StateConflict
from app.infrastructure.sqlite.repositories import AssessmentRepository, ReportRepository
from tests.conftest import raw_exec

# Seed: study-demo; participant-b = student-b; post-demo has item 'post-item' (max 7 + 3), no attempts.


@pytest.fixture
def attempt(conn):
    return AssessmentRepository(conn).start_attempt(student_id="student-b", assessment_id="post-demo")


def test_start_attempt_is_resumable_and_limited(conn, attempt):
    repo = AssessmentRepository(conn)
    assert repo.start_attempt(student_id="student-b", assessment_id="post-demo")["id"] == attempt["id"]
    repo.save_response(student_id="student-b", attempt_id=attempt["id"], item_id="post-item", solution="x=6")
    repo.submit_attempt(student_id="student-b", attempt_id=attempt["id"])
    with pytest.raises(StateConflict, match="remaining"):
        repo.start_attempt(student_id="student-b", assessment_id="post-demo")


def test_non_participant_cannot_start(conn):
    with pytest.raises(PermissionDenied):
        AssessmentRepository(conn).start_attempt(student_id="researcher-demo", assessment_id="post-demo")


def test_items_hide_solution_and_hints(conn, attempt):
    [item] = AssessmentRepository(conn).items_for_attempt(student_id="student-b", attempt_id=attempt["id"])
    assert "teacher_solution" not in item and "hints" not in item and item["statement"]


def test_other_student_cannot_touch_attempt(conn, attempt):
    with pytest.raises(NotFound):
        AssessmentRepository(conn).save_response(student_id="student-a", attempt_id=attempt["id"],
                                                 item_id="post-item", solution="x")


def test_submit_requires_answers_then_freezes_content(conn, attempt):
    repo = AssessmentRepository(conn)
    with pytest.raises(StateConflict, match="unanswered"):
        repo.submit_attempt(student_id="student-b", attempt_id=attempt["id"])
    r = repo.save_response(student_id="student-b", attempt_id=attempt["id"], item_id="post-item",
                           solution="x=5", explanation="nháp")
    repo.save_response(student_id="student-b", attempt_id=attempt["id"], item_id="post-item",
                       solution="x=6", explanation="Chuyển vế rồi chia 2")  # draft overwrite allowed
    sub = repo.submit_attempt(student_id="student-b", attempt_id=attempt["id"])
    assert repo.submit_attempt(student_id="student-b", attempt_id=attempt["id"]) == sub  # idempotent
    with pytest.raises(StateConflict):
        repo.save_response(student_id="student-b", attempt_id=attempt["id"], item_id="post-item", solution="x=7")
    # DB-level locks hold even if a buggy service bypasses the repository:
    for sql in ("UPDATE item_responses SET solution='x=9' WHERE id=?", "DELETE FROM item_responses WHERE id=?"):
        with pytest.raises(sqlite3.IntegrityError, match="locked"):
            raw_exec(conn, sql, (r["id"],))
    with pytest.raises(sqlite3.IntegrityError, match="reopened"):
        raw_exec(conn, "UPDATE assessment_attempts SET submitted_at=NULL WHERE id=?", (attempt["id"],))
    with pytest.raises(sqlite3.IntegrityError, match="deleted"):
        raw_exec(conn, "DELETE FROM assessment_attempts WHERE id=?", (attempt["id"],))


def test_cannot_grade_before_submission(conn, attempt):
    r = AssessmentRepository(conn).save_response(student_id="student-b", attempt_id=attempt["id"],
                                                 item_id="post-item", solution="x=6")
    with pytest.raises(IntegrityViolation, match="before submission"):
        AssessmentRepository(conn).grade_response(grader_id="teacher-demo", response_id=r["id"],
                                                  solution_score=7, explanation_score=3)


def _submitted_response(conn, attempt):
    repo = AssessmentRepository(conn)
    r = repo.save_response(student_id="student-b", attempt_id=attempt["id"], item_id="post-item", solution="x=6")
    repo.submit_attempt(student_id="student-b", attempt_id=attempt["id"])
    return r["id"]


def test_total_is_null_until_graded_then_counts_zero(conn, attempt):
    rid = _submitted_response(conn, attempt)
    repo = AssessmentRepository(conn)
    assert repo.totals(attempt["id"])["total_score"] is None
    repo.grade_response(grader_id="teacher-demo", response_id=rid, solution_score=0, explanation_score=0)
    assert repo.totals(attempt["id"])["total_score"] == 0  # graded zero is 0, not NULL


def test_grading_policy_and_maximum(conn, attempt):
    rid = _submitted_response(conn, attempt)
    repo = AssessmentRepository(conn)
    with pytest.raises(PermissionDenied):  # researcher only, not teacher
        repo.grade_response(grader_id="researcher-demo", response_id=rid, solution_score=1, explanation_score=1)
    with pytest.raises(IntegrityViolation, match="maximum"):
        repo.grade_response(grader_id="teacher-demo", response_id=rid, solution_score=8, explanation_score=0)
    raw_exec(conn, "DELETE FROM study_researchers WHERE researcher_id='teacher-demo'")
    with pytest.raises(PermissionDenied):
        repo.grade_response(grader_id="teacher-demo", response_id=rid, solution_score=1, explanation_score=1)


def test_items_locked_once_attempts_exist(conn, attempt):
    with pytest.raises(sqlite3.IntegrityError, match="locked"):
        raw_exec(conn, "INSERT INTO assessment_items VALUES('new-item','post-demo','p1',1,2,5,3)")
    with pytest.raises(sqlite3.IntegrityError, match="locked"):
        raw_exec(conn, "DELETE FROM assessment_items WHERE id='post-item'")
    with pytest.raises(sqlite3.IntegrityError, match="locked"):
        raw_exec(conn, "UPDATE assessments SET rubric_version='rubric-v2' WHERE id='post-demo'")


def test_items_editable_before_any_attempt(conn):
    raw_exec(conn, "INSERT INTO assessment_items VALUES('new-item','post-demo','p1',1,2,5,3)")


def test_cross_assessment_item_still_rejected_by_fk(conn, attempt):
    """Baseline FK guarantee re-checked on an UNSUBMITTED attempt (the shipped test uses a submitted one)."""
    with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY"):
        raw_exec(conn, "INSERT INTO item_responses(id, attempt_id, assessment_id, item_id, solution)"
                       " VALUES('bad', ?, 'post-demo', 'pre-item', 'x')", (attempt["id"],))


# ----------------------------------------------------------------- reports
def test_research_export_allowlist_and_scope(conn, tmp_path):
    reports = ReportRepository(conn)
    out = reports.export_research_csv(study_id="study-demo", researcher_id="researcher-demo",
                                      out_path=tmp_path / "r.csv")
    with out.open(encoding="utf-8-sig") as fh:
        data = list(csv.DictReader(fh))
    assert list(data[0]) == ["participant_code", "condition", "phase", "attempt_id", "total_score",
                             "expected_items", "answered_items", "graded_items"]
    text = out.read_text(encoding="utf-8-sig")
    for identifier in ("student-a", "student-b", "Học sinh", "participant-a"):
        assert identifier not in text
    raw_exec(conn, "INSERT INTO studies(id, title) VALUES('other-study','Other')")
    with pytest.raises(NotFound):
        reports.research_results(study_id="other-study", researcher_id="researcher-demo")
    with pytest.raises(PermissionDenied):
        reports.research_results(study_id="study-demo", researcher_id="student-a")


def test_class_report_scoped_to_teacher(conn):
    reports = ReportRepository(conn)
    rows = reports.class_sessions(class_id="class-demo", teacher_id="teacher-demo")
    assert [r["id"] for r in rows] == ["session-demo"] and rows[0]["total_hint_count"] == 1
    dist = reports.error_distribution(class_id="class-demo", teacher_id="teacher-demo")
    assert dist == [{"math_status": "invalid", "error_code": None, "occurrences": 1}]
    with pytest.raises(PermissionDenied):
        reports.class_sessions(class_id="class-demo", teacher_id="researcher-demo")
