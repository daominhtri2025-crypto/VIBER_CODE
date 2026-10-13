"""Migration 0002 session lineage; content versioning; assignments; audit log."""
from __future__ import annotations

import sqlite3

import pytest

from app.domain.errors import IntegrityViolation, NotFound, PermissionDenied, StateConflict, ValidationFailed
from app.infrastructure.sqlite.repositories import (
    AssignmentRepository, ClassRepository, ContentRepository, SessionRepository,
)
from tests.conftest import raw_exec

SPEC = {"variable": "x", "domain": "R", "lhs": "5*x-2", "rhs": "13"}
HINTS = ["Muốn tìm x em cần làm gì trước?", "Cộng cùng một số vào hai vế.", "Thử cộng 2 vào hai vế."]


@pytest.fixture
def parent(conn):
    """session-demo moved to INDEPENDENT_PRACTICE, as the state machine will do."""
    SessionRepository(conn).transition_state(actor_id="student-a", session_id="session-demo",
                                             expected_version=2, to_state="INDEPENDENT_PRACTICE")
    return "session-demo"


def child(conn, **over):
    args = dict(student_id="student-a", problem_id="p2", problem_version=1, learning_mode="independent",
                initial_state="SOLVE_STEP", parent_session_id="session-demo")
    args.update(over)
    return SessionRepository(conn).create(**args)


# ---------------------------------------------------------------- lineage
def test_child_independent_session_links_to_parent(conn, parent):
    c = child(conn)
    assert c["parent_session_id"] == parent and c["learning_mode"] == "independent"


@pytest.mark.parametrize("over, msg", [
    (dict(problem_id="p1"), "different problem"),
    (dict(learning_mode="guided", initial_state="READ_PROBLEM"), "independent"),
])
def test_child_rules(conn, parent, over, msg):
    with pytest.raises(IntegrityViolation, match=msg):
        child(conn, **over)


def test_child_of_other_students_session_rejected(conn, parent):
    with pytest.raises(IntegrityViolation, match="same student"):
        child(conn, student_id="student-b")


def test_child_requires_parent_in_independent_phase(conn):
    with pytest.raises(IntegrityViolation, match="INDEPENDENT_PRACTICE"):
        child(conn)


def test_study_scope_requires_participant_and_inheritance(conn, parent):
    # session-demo has no study_id, so a child claiming one must be rejected
    with pytest.raises(IntegrityViolation, match="inherit"):
        child(conn, study_id="study-demo")
    raw_exec(conn, "INSERT INTO users(id, display_name) VALUES('student-c','C')")
    raw_exec(conn, "INSERT INTO user_roles VALUES('student-c','student')")
    with pytest.raises(IntegrityViolation, match="participant"):
        SessionRepository(conn).create(student_id="student-c", problem_id="p2", problem_version=1,
                                       learning_mode="guided", study_id="study-demo")
    s = SessionRepository(conn).create(student_id="student-b", problem_id="p2", problem_version=1,
                                       learning_mode="guided", study_id="study-demo")
    assert s["study_id"] == "study-demo"


def test_lineage_columns_are_immutable(conn, parent):
    c = child(conn)
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        raw_exec(conn, "UPDATE learning_sessions SET parent_session_id=NULL WHERE id=?", (c["id"],))
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        raw_exec(conn, "UPDATE learning_sessions SET study_id='study-demo' WHERE id=?", (c["id"],))


# ---------------------------------------------------------------- content
def test_version_lifecycle_and_student_view(conn):
    repo = ContentRepository(conn)
    pid = repo.create_problem(author_id="teacher-demo", topic_id="linear-equations")
    v = repo.create_version(author_id="teacher-demo", problem_id=pid, statement="Giải 5x - 2 = 13",
                            math_spec=SPEC, teacher_solution="x=3", hints=HINTS, difficulty="easy")
    repo.update_draft(author_id="teacher-demo", problem_id=pid, version=v, statement="Giải phương trình 5x - 2 = 13")
    with pytest.raises(NotFound):
        repo.get_version_for_student(pid, v)  # drafts invisible to students
    repo.approve_version(approver_id="teacher-demo", problem_id=pid, version=v)
    student_view = repo.get_version_for_student(pid, v)
    assert set(student_view) == {"problem_id", "version", "statement", "difficulty"}
    with pytest.raises(StateConflict):
        repo.update_draft(author_id="teacher-demo", problem_id=pid, version=v, statement="đổi")
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        raw_exec(conn, "UPDATE problem_versions SET teacher_solution='x' WHERE problem_id=?", (pid,))
    assert repo.create_version(author_id="teacher-demo", problem_id=pid, statement="Giải 5x - 2 = 18",
                               math_spec=SPEC, teacher_solution="x=4", hints=HINTS, difficulty="easy") == 2
    assert repo.get_version_internal(pid, 1)["math_spec"] == SPEC


@pytest.mark.parametrize("over", [
    dict(math_spec={"variable": "x"}), dict(hints=["a", "b"]), dict(difficulty="trivial"),
])
def test_version_validation(conn, over):
    repo = ContentRepository(conn)
    args = dict(author_id="teacher-demo", problem_id="p1", statement="s", math_spec=SPEC,
                teacher_solution="t", hints=HINTS, difficulty="easy")
    args.update(over)
    with pytest.raises(ValidationFailed):
        repo.create_version(**args)


def test_only_author_and_teachers(conn):
    repo = ContentRepository(conn)
    with pytest.raises(PermissionDenied):
        repo.create_problem(author_id="student-a", topic_id="linear-equations")
    raw_exec(conn, "INSERT INTO users(id, display_name) VALUES('teacher-2','T2')")
    raw_exec(conn, "INSERT INTO user_roles VALUES('teacher-2','teacher')")
    with pytest.raises(PermissionDenied):
        repo.create_version(author_id="teacher-2", problem_id="p1", statement="s", math_spec=SPEC,
                            teacher_solution="t", hints=HINTS, difficulty="easy")


# ------------------------------------------------------------- assignments
def test_assignment_requires_owned_class_and_approved_problem(conn):
    repo = AssignmentRepository(conn)
    pid = ContentRepository(conn).create_problem(author_id="teacher-demo", topic_id="linear-equations")
    ContentRepository(conn).create_version(author_id="teacher-demo", problem_id=pid, statement="s",
                                           math_spec=SPEC, teacher_solution="t", hints=HINTS, difficulty="easy")
    with pytest.raises(IntegrityViolation, match="approved"):
        repo.create(teacher_id="teacher-demo", class_id="class-demo", title="Bài 2",
                    learning_mode="guided", problems=[(pid, 1)])
    assert conn.execute("SELECT count(*) FROM assignments").fetchone()[0] == 1  # atomic: no orphan
    raw_exec(conn, "INSERT INTO users(id, display_name) VALUES('teacher-2','T2')")
    raw_exec(conn, "INSERT INTO user_roles VALUES('teacher-2','teacher')")
    with pytest.raises(NotFound):
        repo.create(teacher_id="teacher-2", class_id="class-demo", title="x", learning_mode="guided",
                    problems=[("p2", 1)])


def test_student_sees_statement_only(conn):
    [a] = AssignmentRepository(conn).list_for_student("student-a")
    assert a["id"] == "assignment-demo" and len(a["problems"]) == 2
    for p in a["problems"]:
        assert "teacher_solution" not in p and "hints" not in p
    with pytest.raises(NotFound):
        AssignmentRepository(conn).get_for_student("assignment-demo", "researcher-demo")


def test_class_membership_requires_student_role(conn):
    with pytest.raises(PermissionDenied):
        ClassRepository(conn).add_member(class_id="class-demo", student_id="researcher-demo",
                                         teacher_id="teacher-demo")


# -------------------------------------------------------------------- audit
def test_audit_log_is_append_only(conn):
    SessionRepository(conn).transition_state(actor_id="student-a", session_id="session-demo",
                                             expected_version=2, to_state="VERIFY_RESULT")
    with pytest.raises(sqlite3.IntegrityError, match="append-only"):
        raw_exec(conn, "UPDATE audit_log SET action='x'")
    with pytest.raises(sqlite3.IntegrityError, match="append-only"):
        raw_exec(conn, "DELETE FROM audit_log")
