"""SessionService end-to-end (handoff §7 GĐ2 acceptance), on a fresh migrated demo DB."""
from __future__ import annotations

import dataclasses
import itertools

import pytest

from app.application.session_service import SessionService
from app.domain.errors import IdempotencyConflict, StateConflict, ValidationFailed, VersionConflict
from app.infrastructure.sqlite.repositories import ContentRepository
from tests.conftest import raw_exec

STUDENT = "student-b"  # seed student-a already owns session-demo on p1
_ids = itertools.count()


def rid(prefix="r"):
    return f"{prefix}-{next(_ids)}"


@pytest.fixture
def svc(conn):
    return SessionService(conn)


class Flow:
    """Tiny driver keeping expected_version in sync, like a well-behaved client."""

    def __init__(self, svc, reply):
        self.svc, self.r = svc, reply

    @property
    def sid(self):
        return self.r.session_id

    def _call(self, name, **kw):
        self.r = getattr(self.svc, name)(student_id=STUDENT, session_id=self.sid,
                                         expected_version=self.r.session_version, **kw)
        return self.r

    def read(self, text="Tìm giá trị của x"):
        return self._call("read_problem", request_id=rid(), restatement=text)

    def knowledge(self, option):
        return self._call("answer_knowledge", request_id=rid(), option_id=option)

    def plan(self, option):
        return self._call("answer_plan", request_id=rid(), option_id=option)

    def step(self, eq, op, val=None, request_id=None):
        return self._call("submit_step", request_id=request_id or rid("s"), submitted_equation=eq,
                          operation=op, operation_value=val, explanation="Em giải thích")

    def verify(self, substitution=None, conclusion=None):
        return self._call("verify", request_id=rid("v"), substitution=substitution, conclusion=conclusion)

    def hint(self):
        self.r = self.svc.request_hint(student_id=STUDENT, session_id=self.sid, request_id=rid("h"))
        return self.r


def guided(svc) -> Flow:
    return Flow(svc, svc.start(student_id=STUDENT, problem_id="p1", problem_version=1,
                               assignment_id="assignment-demo"))


def to_solving(svc) -> Flow:
    f = guided(svc)
    f.read()
    f.knowledge("k-transpose")
    f.plan("pl-transpose-5")
    assert f.r.state == "SOLVE_STEP"
    return f


def reply_text(r) -> str:
    return " ".join(str(v) for v in dataclasses.asdict(r).values())


# ------------------------------------------------------------ canonical flow
def test_handoff_example_end_to_end(svc, conn):
    """Handoff §5.3: 2x+5=17 → wrong 2x=22 → fix 2x=12 → x=6 → verify → independent practice → done."""
    f = guided(svc)
    assert f.r.state == "READ_PROBLEM"
    f.read()
    assert f.r.state == "IDENTIFY_KNOWLEDGE" and {o["id"] for o in f.r.options} >= {"k-transpose"}
    assert all(set(o) == {"id", "label"} for o in f.r.options)  # no 'correct' flag leaks to client
    f.knowledge("k-transpose")
    f.plan("pl-sub-5")
    r = f.step("2x=22", "subtract_both_sides", "5")
    assert (r.math_status, r.error_code, r.state) == ("invalid", "SIGN_ERROR", "SOLVE_STEP")
    r = f.step("2x=12", "subtract_both_sides", "5")
    assert r.math_status == "valid" and r.state == "SOLVE_STEP"
    r = f.step("x=6", "divide_both_sides", "2")
    assert r.state == "VERIFY_RESULT" and "thay" in r.question
    r = f.verify(substitution="2×6+5=17")
    assert r.state == "INDEPENDENT_PRACTICE" and r.next_session_id
    child = Flow(svc, svc.view(student_id=STUDENT, session_id=r.next_session_id))
    assert child.r.extra["statement"] == "Giải phương trình 3x - 4 = 11"  # Q9: same topic & difficulty, unseen
    child.step("3x=15", "transpose_term", "-4")
    child.step("x=5", "divide_both_sides", "3")
    done = svc.submit_independent(student_id=STUDENT, session_id=child.sid, expected_version=child.r.session_version)
    assert done.state == "COMPLETED" and done.summary["reached_correct_final_form"] is True
    assert svc.view(student_id=STUDENT, session_id=f.sid).state == "COMPLETED"  # parent closed too


def test_no_reply_reveals_the_answer_before_student_writes_it(svc):
    f = to_solving(svc)
    replies = [f.r, f.hint(), f.hint(), f.hint(), f.step("2x=13", "subtract_both_sides", "5")]
    for r in replies:
        text = reply_text(r)
        assert "x=6" not in text.replace(" ", "") and "teacher_solution" not in text
        assert "Chia hai vế cho 2 được x=6" not in text  # p1 teacher_solution fragment


def test_alternative_valid_path_accepted(svc):
    f = to_solving(svc)
    f.step("x+5/2=17/2", "divide_both_sides", "2")
    assert f.r.math_status == "valid"
    f.step("x=17/2-5/2", "subtract_both_sides", "5/2")
    assert f.r.math_status == "valid" and f.r.state == "SOLVE_STEP"  # not simplest yet
    assert "rút gọn" in f.r.question
    f.step("x=6", "collect_like_terms")
    assert f.r.state == "VERIFY_RESULT"


def test_skipped_step_is_operation_mismatch(svc):
    f = to_solving(svc)
    r = f.step("x=6", "subtract_both_sides", "5")
    assert r.error_code == "OPERATION_MISMATCH" and r.state == "SOLVE_STEP"


def test_unknown_input_is_not_a_failure_and_never_offers_hints(svc):
    f = to_solving(svc)
    for junk in ("2x = ?", "abc", "x²=4"):
        r = f.step(junk, "subtract_both_sides", "5")
        assert r.math_status == "unknown" and r.hint is None


def test_base_equation_ignores_invalid_steps(svc):
    f = to_solving(svc)
    f.step("2x=22", "subtract_both_sides", "5")
    assert svc.view(student_id=STUDENT, session_id=f.sid).extra["current_equation"] == "2*x+5=17"


# --------------------------------------------------------------- HintPolicy
def test_offer_after_two_failures_then_levels_reset_after_valid_step(svc):
    f = to_solving(svc)
    assert f.step("2x=22", "subtract_both_sides", "5").hint is None
    r = f.step("2x=13", "subtract_both_sides", "5")
    assert (r.hint_level, r.hint_trigger) == (1, "system_offer")
    assert f.hint().hint_level == 2
    f.step("2x=12", "subtract_both_sides", "5")  # valid -> new scope
    assert f.hint().hint_level == 1
    assert "chia" in f.r.hint.lower() or "nhân" in f.r.hint.lower()  # strategy for 2x=12


def test_needs_teacher_after_level3_and_failure(svc):
    f = to_solving(svc)
    assert [f.hint().hint_level for _ in range(3)] == [1, 2, 3]
    r = f.hint()
    assert r.hint is None and r.needs_teacher
    r = f.step("2x=13", "subtract_both_sides", "5")
    assert r.needs_teacher and "thầy/cô" in r.feedback


def test_hint_requires_hintable_state(svc):
    f = guided(svc)
    with pytest.raises(StateConflict):
        f.hint()  # READ_PROBLEM


def test_hint_retry_is_counted_once(svc, conn):
    f = to_solving(svc)
    a = svc.request_hint(student_id=STUDENT, session_id=f.sid, request_id="same")
    b = svc.request_hint(student_id=STUDENT, session_id=f.sid, request_id="same")
    assert (a.hint, a.hint_level) == (b.hint, b.hint_level) and b.replayed
    assert conn.execute("SELECT count(*) FROM hint_events WHERE session_id=?", (f.sid,)).fetchone()[0] == 1
    assert conn.execute("SELECT scope FROM hint_events WHERE session_id=?", (f.sid,)).fetchone()[0] == \
        "SOLVE_STEP:start"


# ------------------------------------------------------- stages (Q6)
def test_knowledge_advances_with_support_after_three_rejections(svc):
    f = guided(svc)
    f.read()
    f.knowledge("k-area")
    r = f.knowledge("k-pythagoras")
    assert r.hint_trigger == "system_offer" and r.hint_level == 1
    r = f.knowledge("k-quadratic")
    assert r.state == "PROPOSE_PLAN" and r.extra["advanced_with_support"]
    assert "chuyển vế" in r.feedback


def test_unproductive_plan_rejected_even_if_executable(svc):
    f = guided(svc)
    f.read()
    f.knowledge("k-equal-ops")
    r = f.plan("pl-add-5")
    assert r.state == "PROPOSE_PLAN" and r.extra["accepted"] is False
    with pytest.raises(ValidationFailed):
        f.plan("no-such-option")


def test_read_problem_requires_restatement(svc):
    f = guided(svc)
    assert f.read("x").state == "READ_PROBLEM"
    assert f.read("Tìm x thỏa mãn").state == "IDENTIFY_KNOWLEDGE"


@pytest.mark.parametrize("action", ["step", "verify"])
def test_client_cannot_skip_states(svc, action):
    f = guided(svc)
    with pytest.raises(StateConflict):
        if action == "step":
            f.step("2x=12", "subtract_both_sides", "5")
        else:
            f.verify(substitution="2·6+5=17")


# ------------------------------------------------------- retry / concurrency
def test_step_retry_returns_identical_reply(svc, conn):
    f = to_solving(svc)
    f.step("2x=22", "subtract_both_sides", "5")
    v = f.r.session_version
    first = svc.submit_step(student_id=STUDENT, session_id=f.sid, expected_version=v, request_id="dup",
                            submitted_equation="2x=13", operation="subtract_both_sides", operation_value="5",
                            explanation="x")
    again = svc.submit_step(student_id=STUDENT, session_id=f.sid, expected_version=v, request_id="dup",
                            submitted_equation="2x=13", operation="subtract_both_sides", operation_value="5",
                            explanation="x")
    assert again.replayed
    assert dataclasses.replace(again, replayed=False) == first  # same feedback, same offered hint
    assert conn.execute("SELECT count(*) FROM hint_events WHERE session_id=?", (f.sid,)).fetchone()[0] == 1
    with pytest.raises(IdempotencyConflict):
        svc.submit_step(student_id=STUDENT, session_id=f.sid, expected_version=v, request_id="dup",
                        submitted_equation="2x=12", operation="subtract_both_sides", operation_value="5",
                        explanation="x")


def test_stale_version_rejected_without_partial_write(svc, conn):
    f = to_solving(svc)
    with pytest.raises(VersionConflict):
        svc.submit_step(student_id=STUDENT, session_id=f.sid, expected_version=0, request_id="old",
                        submitted_equation="2x=12", operation="subtract_both_sides", operation_value="5")
    assert conn.execute("SELECT count(*) FROM solution_steps WHERE session_id=?", (f.sid,)).fetchone()[0] == 0


def test_stage_answer_retry_does_not_double_count(svc, conn):
    f = guided(svc)
    f.read()
    v = f.r.session_version
    a = svc.answer_knowledge(student_id=STUDENT, session_id=f.sid, expected_version=v, request_id="k", option_id="k-area")
    b = svc.answer_knowledge(student_id=STUDENT, session_id=f.sid, expected_version=v, request_id="k", option_id="k-area")
    assert b.replayed and a.feedback == b.feedback
    n = conn.execute("SELECT count(*) FROM messages WHERE session_id=? AND sender_type='student'", (f.sid,)).fetchone()[0]
    assert n == 2  # read_problem + one knowledge answer


# --------------------------------------------------------------- independent
def test_independent_mode_hides_correctness_and_blocks_hints(svc, conn):
    s = svc.start(student_id=STUDENT, problem_id="p2", problem_version=1, mode="independent")
    assert s.state == "SOLVE_STEP"
    r = svc.submit_step(student_id=STUDENT, session_id=s.session_id, expected_version=0, request_id="i1",
                        submitted_equation="3x=7", operation="transpose_term", operation_value="-4")
    assert r.math_status is None and r.error_code is None and r.hint is None and r.state == "SOLVE_STEP"
    stored = conn.execute("SELECT math_status, error_code FROM solution_steps WHERE request_id='i1'").fetchone()
    assert tuple(stored) == ("invalid", "SIGN_ERROR")  # still recorded for research
    assert "math_status" not in svc.view(student_id=STUDENT, session_id=s.session_id).extra["steps"][0]
    with pytest.raises(StateConflict):
        svc.request_hint(student_id=STUDENT, session_id=s.session_id, request_id="ih")
    done = svc.submit_independent(student_id=STUDENT, session_id=s.session_id, expected_version=1)
    assert done.state == "COMPLETED" and done.summary["reached_correct_final_form"] is False


def test_no_similar_problem_leaves_parent_waiting(svc, conn):
    # student-b has already seen p2 -> no unseen easy problem remains for the transfer task
    raw_exec(conn, "INSERT INTO learning_sessions(id, student_id, problem_id, problem_version, learning_mode)"
                   " VALUES('seen-p2','student-b','p2',1,'practice')")
    f = to_solving(svc)
    f.step("2x=12", "transpose_term", "+5")
    f.step("x=6", "divide_both_sides", "2")
    r = f.verify(substitution="2·6+5=17")
    assert r.state == "INDEPENDENT_PRACTICE" and r.next_session_id is None and r.extra["no_similar_problem"]


# --------------------------------------------------- no solution / infinite
@pytest.mark.parametrize("statement, lhs, rhs, final, conclusion", [
    ("Giải x + 1 = x + 3", "x+1", "x+3", "1=3", "no_solution"),
    ("Giải 2(x + 1) = 2x + 2", "2*(x+1)", "2*x+2", "2x+2=2x+2", None),
])
def test_x_free_conclusions(svc, conn, statement, lhs, rhs, final, conclusion):
    content = ContentRepository(conn)
    pid = content.create_problem(author_id="teacher-demo", topic_id="linear-equations")
    content.create_version(author_id="teacher-demo", problem_id=pid, statement=statement,
                           math_spec={"variable": "x", "domain": "R", "lhs": lhs, "rhs": rhs},
                           teacher_solution="(nội bộ)", hints=["a", "b", "c"], difficulty="hard")
    content.approve_version(approver_id="teacher-demo", problem_id=pid, version=1)
    f = Flow(svc, svc.start(student_id=STUDENT, problem_id=pid, problem_version=1, mode="practice"))
    if conclusion == "no_solution":
        f.step(final, "subtract_both_sides", "x")
        assert f.r.state == "VERIFY_RESULT" and "nghiệm" in f.r.question
        assert f.verify(conclusion="infinite_solutions").error_code == "NON_EQUIVALENT"
        r = f.verify(conclusion="no_solution")
        assert r.state == "INDEPENDENT_PRACTICE"
    else:
        f.step(final, "expand")
        f.step("2=2", "subtract_both_sides", "2x")
        assert f.r.state == "VERIFY_RESULT"
        assert f.verify(conclusion="infinite_solutions").state == "INDEPENDENT_PRACTICE"
