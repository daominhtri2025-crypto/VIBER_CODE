"""MathChecker step semantics, error taxonomy (Q3–Q5, Q7) and handoff §5.3 example."""
from __future__ import annotations

from fractions import Fraction as F

import pytest

from app.domain.math.ast import ErrorCode
from app.domain.math.checker import MathChecker, SolutionKind, Status

C = MathChecker()


def step(base, submitted, op, value=None):
    r = C.check_step(base, submitted, op, value)
    return r.status.value, (r.error_code.value if r.error_code else None)


VALID = ("valid", None)


@pytest.mark.parametrize("base, sub, op, val, expected", [
    # ---- handoff §5.3 canonical example
    ("2x+5=17", "2x=12", "subtract_both_sides", "5", VALID),
    ("2x+5=17", "2x=22", "subtract_both_sides", "5", ("invalid", "SIGN_ERROR")),
    ("2x=12", "x=6", "divide_both_sides", "2", VALID),
    # ---- one operation + arithmetic simplification is one step (Q3)
    ("2x+5=17", "2x=17-5", "subtract_both_sides", "5", VALID),
    ("2x+5=17", "2x+5-5=17-5", "subtract_both_sides", "5", VALID),
    ("2x+5=17", "12=2x", "subtract_both_sides", "5", VALID),           # sides swapped is fine
    ("2x+5=17", "x=6", "subtract_both_sides", "5", ("invalid", "OPERATION_MISMATCH")),  # skipped a step
    ("2x+5=17", "2x=12", "divide_both_sides", "2", ("invalid", "OPERATION_MISMATCH")),  # wrong label
    # ---- transpose_term (Q5): signed term as it appears on the source side
    ("2x+5=17", "2x=12", "transpose_term", "+5", VALID),
    ("2x+5=17", "2x=17-5", "transpose_term", "5", VALID),
    ("2x+5=17", "2x=17+5", "transpose_term", "+5", ("invalid", "SIGN_ERROR")),        # forgot to flip
    ("2x+5=17", "2x=12", "transpose_term", "-5", ("invalid", "OPERATION_MISMATCH")),  # term not present
    ("4x+3=2x+15", "4x-2x+3=15", "transpose_term", "+2x", VALID),
    ("4x+3=2x+15", "6x+3=15", "transpose_term", "+2x", ("invalid", "SIGN_ERROR")),
    ("4x+3=2x+15", "4x=2x+12", "transpose_term", "+3", VALID),
    ("7=3x-2", "9=3x", "transpose_term", "-2", VALID),                  # term on the right side
    ("7=3x-2", "5=3x", "transpose_term", "-2", ("invalid", "SIGN_ERROR")),
    ("2x+5=17", "2x=12", "transpose_term", "5+1", ("unknown", "PARSE_UNKNOWN")),
    # ---- SIGN_ERROR: wrong +/- and whole opposite operation
    ("2x+5=17", "2x+10=22", "subtract_both_sides", "5", ("invalid", "SIGN_ERROR")),
    ("3x-4=11", "3x=7", "add_both_sides", "4", ("invalid", "SIGN_ERROR")),
    # ---- SIGN_ERROR: brackets after minus / negative factor
    ("3-(x-3)=2", "3-x+3=2", "expand", None, VALID),
    ("3-(x-3)=2", "3-x-3=2", "expand", None, ("invalid", "SIGN_ERROR")),
    ("-2(x-3)=4", "-2x+6=4", "expand", None, VALID),
    ("-2(x-3)=4", "-2x-6=4", "expand", None, ("invalid", "SIGN_ERROR")),
    ("5-[2x-(x+1)]=0", "5-[2x-x-1]=0", "expand", None, VALID),
    ("5-[2x-(x+1)]=0", "5-[2x-x+1]=0", "expand", None, ("invalid", "SIGN_ERROR")),
    # ---- ARITHMETIC_ERROR
    ("2x+5=17", "2x=13", "subtract_both_sides", "5", ("invalid", "ARITHMETIC_ERROR")),
    ("2x=12", "x=24", "divide_both_sides", "2", ("invalid", "ARITHMETIC_ERROR")),
    ("2x+3x=10", "6x=10", "collect_like_terms", None, ("invalid", "ARITHMETIC_ERROR")),
    # ---- NON_EQUIVALENT
    ("2x+5=17", "3x=1", "subtract_both_sides", "5", ("invalid", "NON_EQUIVALENT")),
    ("2x=12", "0=0", "multiply_both_sides", "0", ("invalid", "NON_EQUIVALENT")),
    # ---- DIVISION_BY_ZERO
    ("2x=12", "x=6", "divide_both_sides", "0", ("invalid", "DIVISION_BY_ZERO")),
    ("2x=12", "x=6", "divide_both_sides", "3-3", ("invalid", "DIVISION_BY_ZERO")),
    ("2x+5=17", "2x=12/0", "subtract_both_sides", "5", ("invalid", "DIVISION_BY_ZERO")),
    # ---- unknown is not "wrong"
    ("2x+5=17", "2x=12 nhé", "subtract_both_sides", "5", ("unknown", "OUT_OF_SCOPE")),
    ("2x+5=17", "2x=", "subtract_both_sides", "5", ("unknown", "PARSE_UNKNOWN")),
    ("2x+5=17", "x^2=12", "subtract_both_sides", "5", ("unknown", "OUT_OF_SCOPE")),
    ("2x=12", "x=6", "divide_both_sides", "x", ("unknown", "OUT_OF_SCOPE")),
    ("2x=12", "x=6", "square_both_sides", "2", ("unknown", "OUT_OF_SCOPE")),
    ("2x+5=17", "2x=12", "subtract_both_sides", None, ("unknown", "PARSE_UNKNOWN")),
    # ---- fractions / decimals with exact arithmetic
    ("0,5x=3", "x=6", "multiply_both_sides", "2", VALID),
    ("x/3+1=2", "x/3=1", "subtract_both_sides", "1", VALID),
    ("x/3=1", "x=3", "multiply_both_sides", "3", VALID),
    ("3x=2", "x=2/3", "divide_both_sides", "3", VALID),
    ("0,1x+0,2=0,3", "0,1x=0,1", "subtract_both_sides", "0,2", VALID),  # no float drift
])
def test_step_classification(base, sub, op, val, expected):
    assert step(base, sub, op, val) == expected


def test_alternative_valid_path_is_accepted():
    """Different but valid strategy: divide first instead of subtracting first."""
    assert step("2x+4=10", "x+2=5", "divide_both_sides", "2") == VALID
    assert step("x+2=5", "x=3", "subtract_both_sides", "2") == VALID


@pytest.mark.parametrize("base, op, val, sub, kind, value", [
    ("2x=12", "divide_both_sides", "2", "x=6", SolutionKind.SINGLE, 6),
    ("2x=12", "divide_both_sides", "2", "6=x", SolutionKind.SINGLE, 6),
    ("-3x=7", "divide_both_sides", "-3", "x=-7/3", SolutionKind.SINGLE, F(-7, 3)),
    ("2x=12", "divide_both_sides", "2", "x=12/2", None, None),   # valid, but must still simplify
    ("2x=12", "divide_both_sides", "2", "x=6/1", None, None),
    ("2x+5=17", "subtract_both_sides", "5", "2x=12", None, None),
])
def test_final_single_solution_form(base, op, val, sub, kind, value):
    r = C.check_step(base, sub, op, val)
    assert r.status == Status.VALID and r.final_form == kind
    assert r.final_value == (None if value is None else F(value))


@pytest.mark.parametrize("base, sub, op, val, kind", [
    ("x+1=x+3", "1=3", "subtract_both_sides", "x", SolutionKind.NONE),
    ("x+1=x+3", "0x+1=3", "subtract_both_sides", "x", SolutionKind.NONE),
    ("2x+2=2x+2", "0x=0", "transpose_term", "+2x", None),           # two moves at once -> mismatch
    ("2x+2=2x+2", "2=2", "subtract_both_sides", "2x", SolutionKind.INFINITE),
])
def test_x_free_forms(base, sub, op, val, kind):
    r = C.check_step(base, sub, op, val)
    if kind is None:
        assert r.error_code == ErrorCode.OPERATION_MISMATCH
    else:
        assert r.status == Status.VALID and r.final_form == kind


def test_unknown_never_reported_as_invalid():
    for junk in ("", "   ", "x=?", "abc", "2x=12=12", "x=1.5"):
        assert C.check_step("2x=12", junk, "divide_both_sides", "2").status == Status.UNKNOWN


# --------------------------------------------------------- verification (Q7)
@pytest.mark.parametrize("text, ok", [
    ("2·6+5=17", True), ("2*6+5=17", True), ("2(6)+5=17", True), ("17=2×6+5", True),
    ("17=17", False),            # no visible substitution
    ("2·6+5=18", False),         # not the original equation
    ("2x+5=17", False),          # x not replaced
    ("2·7+5=17", False),
])
def test_verify_substitution(text, ok):
    r = C.verify_substitution("2x+5=17", F(6), text)
    assert (r.status == Status.VALID) is ok


def test_verify_negative_and_fraction_values():
    assert C.verify_substitution("-3x=7", F(-7, 3), "-3·(-7/3)=7").status == Status.VALID
    assert C.verify_substitution("4x+3=2x+15", F(6), "4·6+3=2·6+15").status == Status.VALID


@pytest.mark.parametrize("eq, conclusion, status", [
    ("0x=5", "no_solution", Status.VALID), ("0=5", "no_solution", Status.VALID),
    ("0x=0", "infinite_solutions", Status.VALID), ("0x=0", "no_solution", Status.INVALID),
    ("0x=5", "infinite_solutions", Status.INVALID), ("2x=4", "no_solution", Status.INVALID),
    ("0x=5", "maybe", Status.UNKNOWN),
])
def test_conclusion(eq, conclusion, status):
    assert C.check_conclusion(eq, conclusion).status == status


# ------------------------------------------------------------------- plan
@pytest.mark.parametrize("op, val, status", [
    ("transpose_term", "+5", Status.VALID), ("subtract_both_sides", "5", Status.VALID),
    ("transpose_term", "+7", Status.INVALID), ("divide_both_sides", "0", Status.INVALID),
    ("teleport", None, Status.UNKNOWN),
])
def test_check_plan(op, val, status):
    assert C.check_plan("2x+5=17", op, val).status == status


@pytest.mark.parametrize("eq, strategy, value", [
    ("2x+5=17", "move_constants", "+5"), ("2x=12", "divide_coefficient", "2"),
    ("4x+3=2x+15", "move_x_terms", "+2x"), ("3-(x-3)=2", "expand", None),
    ("2x+3x=10", "collect_like_terms", None), ("x=6", "verify", None), ("0x=2", "conclude", None),
    ("x=12/2", "collect_like_terms", None),
])
def test_suggest_next(eq, strategy, value):
    assert C.suggest_next(eq) == (strategy, value)
