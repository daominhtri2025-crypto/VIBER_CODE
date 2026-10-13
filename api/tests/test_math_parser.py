"""Parser whitelist + exact evaluation, cross-checked against SymPy (test-only oracle)."""
from __future__ import annotations

import random
from fractions import Fraction as F

import pytest
import sympy

from app.domain.math.ast import ErrorCode, Linear, MathInputError, evaluate, fmt_term
from app.domain.math.checker import Equation, SolutionKind
from app.domain.math.parser import MAX_INPUT_LEN, parse_equation, parse_expression


def lin(text: str) -> Linear:
    return evaluate(parse_expression(text))


# ------------------------------------------------------------ notation (Q1)
@pytest.mark.parametrize("text, a, b", [
    ("2x+5", 2, 5), ("2*x+5", 2, 5), ("2×x + 5", 2, 5), ("2·x+5", 2, 5), ("2.x+5", 2, 5),
    ("3(x-1)", 3, -3), ("3[x-1]", 3, -3), ("3{x−1}", 3, -3), ("-(x-3)", -1, 3), ("−x – 2", -1, -2),
    ("0,5x", F(1, 2), 0), ("x:2", F(1, 2), 0), ("x÷4", F(1, 4), 0), ("1/2x", F(1, 2), 0),
    ("X+1", 1, 1), ("x(2+1)", 3, 0), ("2^3", 0, 8), ("x^1", 1, 0), ("2*-3", 0, -6), ("--x", 1, 0),
    ("(2x+1)/3", F(2, 3), F(1, 3)), ("12/2", 0, 6), ("0x", 0, 0), ("1,25", 0, F(5, 4)),
])
def test_accepted_notation(text, a, b):
    assert lin(text) == Linear(F(a), F(b))


@pytest.mark.parametrize("text, code", [
    ("2.5x", ErrorCode.PARSE_UNKNOWN),        # dot between digits is ambiguous, never 2·5
    ("2 3x", ErrorCode.PARSE_UNKNOWN),
    ("x2", ErrorCode.PARSE_UNKNOWN),
    ("(x+1)2", ErrorCode.PARSE_UNKNOWN),
    ("2x+", ErrorCode.PARSE_UNKNOWN),
    ("(2x+1", ErrorCode.PARSE_UNKNOWN),
    ("()", ErrorCode.PARSE_UNKNOWN),
    ("2x$1", ErrorCode.PARSE_UNKNOWN),
    ("x^2", ErrorCode.OUT_OF_SCOPE),
    ("x²", ErrorCode.OUT_OF_SCOPE),
    ("x*x", ErrorCode.OUT_OF_SCOPE),
    ("(x+1)(x-1)", ErrorCode.OUT_OF_SCOPE),
    ("1/x", ErrorCode.OUT_OF_SCOPE),
    ("2y", ErrorCode.OUT_OF_SCOPE),
    ("√x", ErrorCode.OUT_OF_SCOPE),
    ("sin(x)", ErrorCode.OUT_OF_SCOPE),
    ("x/0", ErrorCode.DIVISION_BY_ZERO),
    ("x/(3-3)", ErrorCode.DIVISION_BY_ZERO),
    ("2^x", ErrorCode.OUT_OF_SCOPE),
    ("9999999999999x", ErrorCode.OUT_OF_SCOPE),
])
def test_rejected_inputs(text, code):
    with pytest.raises(MathInputError) as exc:
        lin(text)
    assert exc.value.code == code


@pytest.mark.parametrize("payload", [
    "__import__('os').system('echo hacked')", "exec('1')", "lambda: 1", "x; DROP TABLE users",
    "x' OR '1'='1", "{{7*7}}", "eval(x)",
])
def test_code_injection_is_never_executed(payload):
    with pytest.raises(MathInputError):
        parse_equation(payload)


def test_resource_limits():
    with pytest.raises(MathInputError, match="dài"):
        parse_expression("1+" * (MAX_INPUT_LEN // 2) + "1")
    with pytest.raises(MathInputError):
        parse_expression("(" * 30 + "x" + ")" * 30)
    with pytest.raises(MathInputError):
        lin("2^6^6^6")  # 2^(6^...) exponent out of range, no blow-up


@pytest.mark.parametrize("text", ["2x+5", "2x=1=3", "x==2", "=5"])
def test_equation_needs_exactly_one_equals(text):
    with pytest.raises(MathInputError):
        parse_equation(text)


@pytest.mark.parametrize("text, kind, value", [
    ("2x+5=17", SolutionKind.SINGLE, 6), ("4x+3=2x+15", SolutionKind.SINGLE, 6),
    ("x+1=x+3", SolutionKind.NONE, None), ("2(x+1)=2x+2", SolutionKind.INFINITE, None),
    ("0,5x=1/4", SolutionKind.SINGLE, F(1, 2)), ("-3x=7", SolutionKind.SINGLE, F(-7, 3)),
])
def test_solution_sets(text, kind, value):
    k, v = Equation.parse(text).solution()
    assert k == kind and (v is None if value is None else v == F(value))


def test_fmt_term():
    assert [fmt_term(Linear(F(0), F(5))), fmt_term(Linear(F(-2), F(0))), fmt_term(Linear(F(1), F(0)))] == ["+5", "-2x", "+x"]


# ---------------------------------------------------- SymPy oracle (property)
def _random_expr(rng: random.Random, depth: int = 0) -> str:
    """Random linear expression with EXPLICIT operators (unambiguous for SymPy)."""
    if depth > 2 or rng.random() < 0.3:
        return rng.choice(["x", str(rng.randint(-9, 9)), f"{rng.randint(1, 9)}*x"]).replace("--", "+")
    kind = rng.choice(["+", "-", "*c", "/c", "()"])
    left, right = _random_expr(rng, depth + 1), _random_expr(rng, depth + 1)
    if kind in "+-":
        return f"{left} {kind} ({right})"
    if kind == "*c":
        return f"{rng.randint(-5, 5) or 2}*({left})"
    if kind == "/c":
        return f"({left})/{rng.randint(1, 7)}"
    return f"-({left})"


@pytest.mark.parametrize("seed", range(300))
def test_linear_value_matches_sympy(seed):
    rng = random.Random(seed)
    text = _random_expr(rng)
    ours = lin(text)
    x = sympy.Symbol("x")
    poly = sympy.Poly(sympy.sympify(text, locals={"x": x}, rational=True), x)  # trusted test input only
    coeffs = dict(zip(poly.monoms(), poly.coeffs()))
    assert ours.a == F(str(coeffs.get((1,), 0))) and ours.b == F(str(coeffs.get((0,), 0))), text


@pytest.mark.parametrize("seed", range(200))
def test_solution_matches_sympy(seed):
    rng = random.Random(10_000 + seed)
    left, right = _random_expr(rng), _random_expr(rng)
    ours = Equation.parse(f"{left}={right}").solution()
    x = sympy.Symbol("x")
    sol = sympy.solveset(sympy.Eq(sympy.sympify(left, rational=True), sympy.sympify(right, rational=True)), x, domain=sympy.S.Reals)
    if sol == sympy.S.Reals:
        assert ours[0] == SolutionKind.INFINITE
    elif sol == sympy.S.EmptySet:
        assert ours[0] == SolutionKind.NONE
    else:
        (only,) = list(sol)
        assert ours == (SolutionKind.SINGLE, F(str(only)))
