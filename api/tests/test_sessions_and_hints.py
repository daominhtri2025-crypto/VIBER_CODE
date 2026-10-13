"""SessionRepository + HintRepository: idempotency, optimistic version, ownership, hint blocking."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from app.domain.errors import (
    IdempotencyConflict, IntegrityViolation, NotFound, PermissionDenied, StateConflict,
    ValidationFailed, VersionConflict,
)
from app.infrastructure.sqlite.connection import connect
from app.infrastructure.sqlite.repositories import (
    AssignmentRepository, HintRepository, SessionRepository, UserRepository,
)
from tests.conftest import raw_exec

SID = "session-demo"  # seed: student-a, p1@1, SOLVE_STEP, version 2, base '2*x=12'


def step_args(**over):
    args = dict(actor_id="student-a", session_id=SID, expected_version=2, request_id="req-3",
                previous_equation="2*x=12", submitted_equation="x=6", operation="divide_both_sides",
                operation_value="2", explanation="Em chia hai vế cho 2", math_status="valid")
    args.update(over)
    return args


def count(conn, table, where="1", args=()):
    return conn.execute(f"SELECT count(*) FROM {table} WHERE {where}", args).fetchone()[0]


# ------------------------------------------------------------------ steps
def test_base_equation_comes_from_last_valid_step(conn):
    repo = SessionRepository(conn)
    assert repo.current_equation(SID) == "2*x=12"
    repo.submit_step(**step_args(request_id="r-bad", submitted_equation="x=7",
                                 math_status="invalid", error_code="ARITHMETIC_ERROR"))
    assert repo.current_equation(SID) == "2*x=12"  # invalid step does not become the base


def test_retry_same_request_does_not_add_step(conn):
    repo = SessionRepository(conn)
    first = repo.submit_step(**step_args())
    again = repo.submit_step(**step_args())
    assert first["id"] == again["id"] and again["replayed"] is True
    assert count(conn, "solution_steps", "session_id=?", (SID,)) == 3
    assert repo.get_for_owner(SID, "student-a")["version"] == 3  # bumped once


def test_retry_after_success_with_stale_version_still_replays(conn):
    """Client lost the response: retry carries the old expected_version -> replay, not 409."""
    repo = SessionRepository(conn)
    repo.submit_step(**step_args())
    assert repo.submit_step(**step_args())["replayed"]


def test_same_request_different_payload_conflicts(conn):
    repo = SessionRepository(conn)
    repo.submit_step(**step_args())
    with pytest.raises(IdempotencyConflict):
        repo.submit_step(**step_args(explanation="khác"))


def test_version_conflict_writes_nothing(conn):
    repo = SessionRepository(conn)
    with pytest.raises(VersionConflict):
        repo.submit_step(**step_args(expected_version=1))
    assert count(conn, "solution_steps", "session_id=?", (SID,)) == 2
    assert repo.get_for_owner(SID, "student-a")["version"] == 2
    assert count(conn, "activity_events", "session_id=? AND event_type='submit'", (SID,)) == 0


def test_stale_base_equation_is_rejected(conn):
    with pytest.raises(VersionConflict):
        SessionRepository(conn).submit_step(**step_args(previous_equation="2*x+5=17"))


def test_other_student_cannot_see_or_write(conn):
    repo = SessionRepository(conn)
    with pytest.raises(NotFound):
        repo.get_for_owner(SID, "student-b")
    with pytest.raises(NotFound):
        repo.submit_step(**step_args(actor_id="student-b"))


def test_disabled_student_cannot_submit(conn):
    UserRepository(conn).set_status("student-a", "disabled", actor_id="admin-demo")
    with pytest.raises(PermissionDenied):
        SessionRepository(conn).submit_step(**step_args())


def test_step_requires_solve_state(conn):
    repo = SessionRepository(conn)
    repo.transition_state(actor_id="student-a", session_id=SID, expected_version=2, to_state="VERIFY_RESULT")
    with pytest.raises(StateConflict):
        repo.submit_step(**step_args(expected_version=3))


@pytest.mark.parametrize("over", [
    dict(math_status="invalid"),                       # missing error_code
    dict(math_status="valid", error_code="X"),          # valid with error
    dict(math_status="maybe"),
    dict(submitted_equation="x=" + "1" * 300),          # too long
    dict(request_id=""),
])
def test_step_payload_validation(conn, over):
    with pytest.raises(ValidationFailed):
        SessionRepository(conn).submit_step(**step_args(**over))


def test_unknown_is_stored_as_unknown_not_invalid(conn):
    s = SessionRepository(conn).submit_step(**step_args(submitted_equation="x²=?", math_status="unknown",
                                                         error_code="PARSE_UNKNOWN"))
    assert s["math_status"] == "unknown"
    row = conn.execute("SELECT invalid_step_count FROM session_summary WHERE id=?", (SID,)).fetchone()
    assert row[0] == 1  # still only the seeded invalid step


def test_transition_bumps_version_and_completes(conn):
    repo = SessionRepository(conn)
    s = repo.transition_state(actor_id="student-a", session_id=SID, expected_version=2, to_state="COMPLETED")
    assert s["version"] == 3 and s["completed_at"] is not None
    with pytest.raises(StateConflict):
        repo.transition_state(actor_id="student-a", session_id=SID, expected_version=3, to_state="SOLVE_STEP")
    assert count(conn, "audit_log", "entity_id=?", (SID,)) == 1


def test_transition_version_conflict(conn):
    with pytest.raises(VersionConflict):
        SessionRepository(conn).transition_state(actor_id="student-a", session_id=SID,
                                                 expected_version=0, to_state="VERIFY_RESULT")


def test_concurrent_writers_second_one_conflicts(db_path):
    """Two connections race on the same version: exactly one step is written."""
    c1, c2 = connect(db_path), connect(db_path)
    try:
        SessionRepository(c1).submit_step(**step_args(request_id="a"))
        with pytest.raises(VersionConflict):
            SessionRepository(c2).submit_step(**step_args(request_id="b"))
        assert count(c1, "solution_steps", "session_id=?", (SID,)) == 3
    finally:
        c1.close(), c2.close()


def test_writer_lock_times_out_cleanly(db_path):
    c1, c2 = connect(db_path), connect(db_path, busy_timeout_ms=100)
    try:
        c1.execute("BEGIN IMMEDIATE")
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            SessionRepository(c2).submit_step(**step_args())
        c1.execute("ROLLBACK")
        assert not c2.in_transaction
    finally:
        c1.close(), c2.close()


# --------------------------------------------------------------- creation
def test_create_session_from_assignment_and_resume(conn):
    repo = SessionRepository(conn)
    s = repo.create(student_id="student-b", problem_id="p3", problem_version=1,
                    learning_mode="guided", assignment_id="assignment-demo")
    assert s["state"] == "READ_PROBLEM" and s["version"] == 0
    assert repo.find_resumable(student_id="student-b", problem_id="p3", problem_version=1,
                               assignment_id="assignment-demo")["id"] == s["id"]


def test_create_session_wrong_mode_or_problem_rejected(conn):
    repo = SessionRepository(conn)
    with pytest.raises(IntegrityViolation):
        repo.create(student_id="student-b", problem_id="p3", problem_version=1,
                    learning_mode="practice", assignment_id="assignment-demo")
    with pytest.raises(IntegrityViolation):
        repo.create(student_id="student-b", problem_id="p2", problem_version=1,
                    learning_mode="guided", assignment_id="assignment-demo")


def test_non_student_cannot_create_session(conn):
    with pytest.raises(PermissionDenied):
        SessionRepository(conn).create(student_id="teacher-demo", problem_id="p2", problem_version=1,
                                       learning_mode="guided")


def test_past_due_assignment_rejected(conn):
    raw_exec(conn, "UPDATE assignments SET due_at='2026-01-01T00:00:00.000Z' WHERE id='assignment-demo'")
    with pytest.raises(StateConflict):
        SessionRepository(conn).create(student_id="student-b", problem_id="p3", problem_version=1,
                                       learning_mode="guided", assignment_id="assignment-demo",
                                       now=datetime(2026, 10, 13, tzinfo=timezone.utc))
    assert AssignmentRepository.is_past_due({"due_at": "2026-01-01T00:00:00.000Z"},
                                            datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=1))


# ------------------------------------------------------------------ hints
def hint_args(**over):
    args = dict(actor_id="student-a", session_id=SID, request_id="h-1", hint_level=1,
                trigger="student_request", content="Em xem lại vế phải nhé.", step_id="step-2")
    args.update(over)
    return args


def test_hint_retry_counts_once(conn):
    repo = HintRepository(conn)
    a = repo.record(**hint_args())
    b = repo.record(**hint_args(content="AI phrased it differently on retry"))
    assert a["id"] == b["id"] and b["replayed"] and b["content"] == a["content"]
    assert conn.execute("SELECT requested_hint_count FROM session_summary WHERE id=?", (SID,)).fetchone()[0] == 2


def test_hint_request_reuse_with_other_level_conflicts(conn):
    repo = HintRepository(conn)
    repo.record(**hint_args())
    with pytest.raises(IdempotencyConflict):
        repo.record(**hint_args(hint_level=2))


def test_hint_does_not_bump_session_version(conn):
    HintRepository(conn).record(**hint_args())
    assert SessionRepository(conn).get_for_owner(SID, "student-a")["version"] == 2


def test_hint_blocked_in_independent_session(conn):
    s = SessionRepository(conn).create(student_id="student-a", problem_id="p2", problem_version=1,
                                       learning_mode="independent", initial_state="SOLVE_STEP")
    with pytest.raises(StateConflict):
        HintRepository(conn).record(**hint_args(session_id=s["id"], step_id=None))
    # Defence in depth: even a direct INSERT is rejected by the DB trigger.
    with pytest.raises(sqlite3.IntegrityError):
        raw_exec(conn, "INSERT INTO hint_events(id, session_id, hint_level, trigger, content, request_id)"
                       " VALUES('x', ?, 1, 'student_request', 'h', 'r')", (s["id"],))


@pytest.mark.parametrize("state", ["INDEPENDENT_PRACTICE", "COMPLETED"])
def test_hint_blocked_after_guided_phase(conn, state):
    SessionRepository(conn).transition_state(actor_id="student-a", session_id=SID, expected_version=2, to_state=state)
    with pytest.raises(StateConflict):
        HintRepository(conn).record(**hint_args())


def test_hint_request_unique_at_db_level(conn):
    HintRepository(conn).record(**hint_args())
    with pytest.raises(sqlite3.IntegrityError):
        raw_exec(conn, "INSERT INTO hint_events(id, session_id, hint_level, trigger, content, request_id)"
                       " VALUES('dup', ?, 1, 'student_request', 'h', 'h-1')", (SID,))


@pytest.mark.parametrize("over", [dict(hint_level=0), dict(hint_level=4), dict(trigger="ai_decided")])
def test_hint_validation(conn, over):
    with pytest.raises(ValidationFailed):
        HintRepository(conn).record(**hint_args(**over))


def test_other_student_cannot_request_hint(conn):
    with pytest.raises(NotFound):
        HintRepository(conn).record(**hint_args(actor_id="student-b"))
