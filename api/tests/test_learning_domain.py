"""Pure domain: state machine, HintPolicy (Q8), leak guard, content catalogue integrity."""
from __future__ import annotations

import json
import shutil
from fractions import Fraction as F

import pytest

from app.domain.constants import HintTrigger
from app.domain.errors import StateConflict
from app.domain.learning import hint_policy as hp
from app.domain.learning.hint_policy import Kind, ScopeEvent
from app.domain.learning.leak_guard import leaks_answer
from app.domain.learning.state_machine import TRANSITIONS, Event, can, initial_state, next_state
from app.domain.math.ast import ErrorCode
from app.domain.math.checker import Equation, MathChecker, Status
from app.infrastructure.content_store import CONTENT_ROOT, ContentIntegrityError, ContentStore

# ------------------------------------------------------------- state machine
GUIDED_PATH = [
    ("READ_PROBLEM", Event.PROBLEM_READ, "IDENTIFY_KNOWLEDGE"),
    ("IDENTIFY_KNOWLEDGE", Event.KNOWLEDGE_ACCEPTED, "PROPOSE_PLAN"),
    ("PROPOSE_PLAN", Event.PLAN_ACCEPTED, "SOLVE_STEP"),
    ("SOLVE_STEP", Event.FINAL_FORM_REACHED, "VERIFY_RESULT"),
    ("VERIFY_RESULT", Event.VERIFIED, "INDEPENDENT_PRACTICE"),
    ("INDEPENDENT_PRACTICE", Event.PRACTICE_FINISHED, "COMPLETED"),
]


@pytest.mark.parametrize("state, event, target", GUIDED_PATH)
def test_guided_path(state, event, target):
    assert next_state("guided", state, event) == target


def test_initial_states():
    assert (initial_state("guided"), initial_state("practice"), initial_state("independent")) == \
        ("READ_PROBLEM", "SOLVE_STEP", "SOLVE_STEP")


@pytest.mark.parametrize("mode, state, event", [
    ("guided", "READ_PROBLEM", Event.PLAN_ACCEPTED),          # cannot skip stages
    ("guided", "SOLVE_STEP", Event.VERIFIED),                  # cannot verify before a final form
    ("guided", "COMPLETED", Event.PROBLEM_READ),               # terminal
    ("independent", "SOLVE_STEP", Event.FINAL_FORM_REACHED),   # would leak correctness
    ("practice", "READ_PROBLEM", Event.PROBLEM_READ),          # practice has no scaffolding stages
    ("guided", "SOLVE_STEP", Event.INDEPENDENT_SUBMITTED),
])
def test_forbidden_transitions(mode, state, event):
    assert not can(mode, state, event)
    with pytest.raises(StateConflict):
        next_state(mode, state, event)


def test_every_transition_moves_forward_or_terminates():
    order = ["READ_PROBLEM", "IDENTIFY_KNOWLEDGE", "PROPOSE_PLAN", "SOLVE_STEP", "VERIFY_RESULT",
             "INDEPENDENT_PRACTICE", "COMPLETED"]
    for (_, src, _), dst in TRANSITIONS.items():
        assert order.index(dst) > order.index(src)


# --------------------------------------------------------------- HintPolicy
A_FAIL, A_OK, A_UNKNOWN = ScopeEvent(Kind.ATTEMPT, True), ScopeEvent(Kind.ATTEMPT, False), ScopeEvent(Kind.ATTEMPT)


def H(level):
    return ScopeEvent(Kind.HINT, level=level)


def test_request_escalates_one_level_at_a_time():
    assert hp.on_request("guided", "SOLVE_STEP", []).level == 1
    assert hp.on_request("guided", "SOLVE_STEP", [H(1)]).level == 2
    assert hp.on_request("guided", "SOLVE_STEP", [H(1), A_FAIL, H(2)]).level == 3
    d = hp.on_request("guided", "SOLVE_STEP", [H(1), H(2), H(3)])
    assert not d.allowed and d.needs_teacher


@pytest.mark.parametrize("mode, state", [("independent", "SOLVE_STEP"), ("guided", "READ_PROBLEM"),
                                         ("guided", "INDEPENDENT_PRACTICE"), ("guided", "COMPLETED")])
def test_request_blocked(mode, state):
    d = hp.on_request(mode, state, [])
    assert not d.allowed and d.reason == "blocked"


def test_system_offer_after_two_consecutive_failures():
    assert not hp.after_attempt("guided", "SOLVE_STEP", [A_FAIL]).allowed
    d = hp.after_attempt("guided", "SOLVE_STEP", [A_FAIL, A_FAIL])
    assert d.allowed and d.level == 1 and d.trigger == HintTrigger.SYSTEM_OFFER
    # counter restarts after a hint
    assert not hp.after_attempt("guided", "SOLVE_STEP", [A_FAIL, A_FAIL, H(1), A_FAIL]).allowed
    assert hp.after_attempt("guided", "SOLVE_STEP", [A_FAIL, A_FAIL, H(1), A_FAIL, A_FAIL]).level == 2


def test_unknown_is_not_a_failure():
    assert not hp.after_attempt("guided", "SOLVE_STEP", [A_UNKNOWN, A_UNKNOWN, A_UNKNOWN]).allowed
    assert not hp.after_attempt("guided", "SOLVE_STEP", [A_FAIL, A_UNKNOWN]).allowed


def test_needs_teacher_after_level3_and_one_more_failure():
    hist = [H(1), H(2), H(3)]
    assert not hp.after_attempt("guided", "SOLVE_STEP", hist + [A_OK]).needs_teacher
    d = hp.after_attempt("guided", "SOLVE_STEP", hist + [A_FAIL])
    assert d.needs_teacher and not d.allowed


def test_no_offer_in_independent():
    assert not hp.after_attempt("independent", "SOLVE_STEP", [A_FAIL] * 5).allowed


# --------------------------------------------------------------- leak guard
@pytest.mark.parametrize("text, leak", [
    ("Vậy x = 6 nhé.", True), ("x=6", True), ("Đáp số là 6.", True), ("x = -7/3", False),
    ("Em thử chia hai vế cho 2.", False), ("Em kiểm tra lại 17 - 5.", False),
    ("Nghiệm bằng 6", True),
])
def test_leak_guard(text, leak):
    assert leaks_answer(text, F(6), visible_context="Giải phương trình 2x + 5 = 17") is leak


def test_leak_guard_allows_numbers_visible_to_student():
    # solution 2 also appears as a coefficient the student can see: not a leak
    assert not leaks_answer("Em thử chia hai vế cho 2.", F(2), visible_context="2x=4")
    assert leaks_answer("x = 2", F(2), visible_context="2x=4")


# -------------------------------------------------------- content catalogue
store = ContentStore()
SEED = [("p1", 1, "2*x+5=17"), ("p2", 1, "3*x-4=11"), ("p3", 1, "4*x+3=2*x+15")]


@pytest.mark.parametrize("pid, ver, eq", SEED)
def test_plan_catalogue_agrees_with_mathchecker(pid, ver, eq):
    cat = store.problem(pid, ver)
    assert any(o["correct"] for o in cat["knowledge"]["options"])
    for o in cat["plan"]["options"]:
        r = MathChecker().check_plan(eq, o["operation"], o.get("value"))
        if o["acceptable"]:
            assert r.status == Status.VALID, o  # an "acceptable" plan must be executable
        assert r.status != Status.UNKNOWN, o


@pytest.mark.parametrize("pid, ver, eq", SEED)
def test_templates_never_leak_solution(pid, ver, eq):
    """Render every template with the values the service can inject; none may reveal the answer."""
    t = store.templates()
    _, solution = Equation.parse(eq).solution()
    values = {"value": v for _, v in [MathChecker().suggest_next(eq)]} | {"side": "phải"}
    texts = []

    def walk(node):
        if isinstance(node, str):
            texts.append(node)
        elif isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk({k: v for k, v in t.items() if k not in ("template_version", "policy")})
    for text in texts:
        for k, v in values.items():
            text = text.replace("{" + k + "}", str(v or ""))
        assert not leaks_answer(text, solution, visible_context=eq), text


def test_templates_cover_every_error_code():
    t = store.templates()["step"]
    covered = set(t["invalid"]) | set(t["unknown"])
    assert covered == {c.value for c in ErrorCode}


def test_tampered_content_is_refused(tmp_path):
    root = tmp_path / "content"
    shutil.copytree(CONTENT_ROOT, root)
    f = root / "problems" / "p1@1.json"
    data = json.loads(f.read_text(encoding="utf-8"))
    data["plan"]["options"][0]["acceptable"] = False
    f.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ContentIntegrityError):
        ContentStore(root).problem("p1", 1)
