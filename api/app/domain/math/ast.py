"""AST, error codes and exact linear evaluation for one-variable linear equations.

Exact arithmetic only (``fractions.Fraction``); no floating point, no ``eval``.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from fractions import Fraction


class ErrorCode(StrEnum):
    """MathChecker error taxonomy (handoff §7 GĐ2 + SIGN_ERROR, decision 13/10/2026)."""
    PARSE_UNKNOWN = "PARSE_UNKNOWN"            # input not understood -> math_status=unknown
    OUT_OF_SCOPE = "OUT_OF_SCOPE"              # understood but outside linear MVP -> unknown
    SIGN_ERROR = "SIGN_ERROR"                  # one sign mishandled (highest diagnostic priority)
    ARITHMETIC_ERROR = "ARITHMETIC_ERROR"      # right operation, wrong computation on one side
    OPERATION_MISMATCH = "OPERATION_MISMATCH"  # equivalent but not what the declared operation gives
    NON_EQUIVALENT = "NON_EQUIVALENT"          # solution set changed
    DIVISION_BY_ZERO = "DIVISION_BY_ZERO"


UNKNOWN_CODES = frozenset({ErrorCode.PARSE_UNKNOWN, ErrorCode.OUT_OF_SCOPE})


class MathInputError(Exception):
    """Raised by parser/evaluator; ``code`` decides unknown vs invalid."""

    def __init__(self, code: ErrorCode, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# Guard against pathological magnitudes (keeps Fraction arithmetic cheap).
MAX_ABS = Fraction(10) ** 30


# ----------------------------------------------------------------------- AST
@dataclass(frozen=True)
class Num:
    value: Fraction


@dataclass(frozen=True)
class Var:
    name: str = "x"


@dataclass(frozen=True)
class Neg:
    operand: "Node"


@dataclass(frozen=True)
class Add:
    """Additive chain; ``terms`` are (sign, node) with sign in {+1, -1}."""
    terms: tuple[tuple[int, "Node"], ...]


@dataclass(frozen=True)
class Group:
    inner: "Node"


@dataclass(frozen=True)
class Mul:
    left: "Node"
    right: "Node"


@dataclass(frozen=True)
class Div:
    left: "Node"
    right: "Node"


@dataclass(frozen=True)
class Pow:
    base: "Node"
    exponent: "Node"


Node = Num | Var | Neg | Add | Group | Mul | Div | Pow


@dataclass(frozen=True)
class Linear:
    """Value ``a*x + b`` with exact coefficients."""
    a: Fraction
    b: Fraction

    def __add__(self, o: "Linear") -> "Linear":
        return Linear(self.a + o.a, self.b + o.b)

    def __sub__(self, o: "Linear") -> "Linear":
        return Linear(self.a - o.a, self.b - o.b)

    def __neg__(self) -> "Linear":
        return Linear(-self.a, -self.b)

    def scale(self, k: Fraction) -> "Linear":
        return Linear(self.a * k, self.b * k)

    @property
    def is_constant(self) -> bool:
        return self.a == 0

    def at(self, x: Fraction) -> Fraction:
        return self.a * x + self.b


ZERO = Linear(Fraction(0), Fraction(0))


def _check(v: Linear) -> Linear:
    for c in (v.a, v.b):
        if abs(c.numerator) > MAX_ABS or c.denominator > MAX_ABS:
            raise MathInputError(ErrorCode.OUT_OF_SCOPE, "Số quá lớn")
    return v


def evaluate(node: Node) -> Linear:
    """Exact linear value; raises OUT_OF_SCOPE for non-linear forms."""
    match node:
        case Num(value=v):
            return Linear(Fraction(0), v)
        case Var():
            return Linear(Fraction(1), Fraction(0))
        case Neg(operand=o):
            return -evaluate(o)
        case Group(inner=i):
            return evaluate(i)
        case Add(terms=terms):
            total = ZERO
            for sign, t in terms:
                v = evaluate(t)
                total = total + (v if sign > 0 else -v)
            return _check(total)
        case Mul(left=l, right=r):
            lv, rv = evaluate(l), evaluate(r)
            if lv.a != 0 and rv.a != 0:
                raise MathInputError(ErrorCode.OUT_OF_SCOPE, "Tích hai biểu thức chứa x (không còn bậc nhất)")
            if lv.a == 0:
                return _check(rv.scale(lv.b))
            return _check(lv.scale(rv.b))
        case Div(left=l, right=r):
            lv, rv = evaluate(l), evaluate(r)
            if rv.a != 0:
                raise MathInputError(ErrorCode.OUT_OF_SCOPE, "Mẫu số chứa x")
            if rv.b == 0:
                raise MathInputError(ErrorCode.DIVISION_BY_ZERO, "Chia cho 0")
            return _check(lv.scale(1 / rv.b))
        case Pow(base=b, exponent=e):
            ev = evaluate(e)
            if ev.a != 0 or ev.b.denominator != 1 or not (0 <= ev.b <= 6):
                raise MathInputError(ErrorCode.OUT_OF_SCOPE, "Số mũ phải là số nguyên từ 0 đến 6")
            bv, n = evaluate(b), int(ev.b)
            if bv.a == 0:
                return _check(Linear(Fraction(0), bv.b ** n))
            if n == 1:
                return bv
            raise MathInputError(ErrorCode.OUT_OF_SCOPE, "Lũy thừa của x (không còn bậc nhất)")
    raise TypeError(f"Unknown node {node!r}")  # pragma: no cover


def top_terms(node: Node) -> tuple[tuple[int, Node], ...]:
    """Top-level additive terms of a side (a bare node is a single + term)."""
    return node.terms if isinstance(node, Add) else ((1, node),)


def contains_var(node: Node) -> bool:
    match node:
        case Var():
            return True
        case Num():
            return False
        case Neg(operand=o) | Group(inner=o):
            return contains_var(o)
        case Add(terms=t):
            return any(contains_var(n) for _, n in t)
        case Mul(left=l, right=r) | Div(left=l, right=r) | Pow(base=l, exponent=r):
            return contains_var(l) or contains_var(r)
    return False  # pragma: no cover


def fmt_fraction(v: Fraction) -> str:
    """Vietnamese-friendly exact formatting: 6, -3, 3/2."""
    return str(v.numerator) if v.denominator == 1 else f"{v.numerator}/{v.denominator}"


def fmt_term(v: Linear, *, signed: bool = True) -> str:
    """Format a single-kind term (pure constant or pure x-term), e.g. '+5', '-2x', '+x'."""
    if v.a != 0 and v.b != 0:
        raise ValueError("fmt_term expects a single term")
    c = v.a if v.a != 0 else v.b
    sign = "-" if c < 0 else ("+" if signed else "")
    mag = abs(c)
    if v.a != 0:
        body = "x" if mag == 1 else (f"{fmt_fraction(mag)}x" if mag.denominator == 1 else f"({fmt_fraction(mag)})x")
    else:
        body = fmt_fraction(mag)
    return f"{sign}{body}"
