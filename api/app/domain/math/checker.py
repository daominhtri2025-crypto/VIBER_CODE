"""MathChecker — the ONLY authority on correctness (handoff §3.2).

Step semantics (decisions Q3–Q5)
-------------------------------
A declared operation is modelled as the same affine map applied to both
sides, ``side -> k·side + c``:

=====================  ==========================  ======================
operation              operation_value             map
=====================  ==========================  ======================
add_both_sides         term v                      side + v
subtract_both_sides    term v                      side - v
multiply_both_sides    constant v ≠ 0              v·side
divide_both_sides      constant v ≠ 0              side / v
transpose_term         signed term t on a side     remove t there, add -t on the other side
expand                 —                           side (value preserved)
collect_like_terms     —                           side (value preserved)
=====================  ==========================  ======================

A step is **valid** iff each submitted side equals the corresponding expected
side as an exact linear value (sides may be swapped). This accepts the
operation *plus arithmetic simplification* in one step (``2x=17-5`` and
``2x=12``) but not a second operation (``2x+5=17`` → ``x=6`` with
"subtract 5" is OPERATION_MISMATCH — strict option Q3).

Diagnosis priority for non-valid steps (Q4):
SIGN_ERROR → ARITHMETIC_ERROR → OPERATION_MISMATCH → NON_EQUIVALENT.

* SIGN_ERROR: the submission matches the expected result after flipping the
  sign of exactly one term on one side — covers forgetting to change sign
  when transposing, using + instead of − (or the whole opposite operation),
  and removing brackets after a minus/negative factor (``-(x-3)`` → ``-x-3``).
* ARITHMETIC_ERROR: one side is right, the other is not.
* OPERATION_MISMATCH: same solution set, but not what the declared operation
  produces (skipped steps, wrong declared operation, unknown term to move).
* NON_EQUIVALENT: the solution set changed.
* unknown (PARSE_UNKNOWN / OUT_OF_SCOPE) is never counted as wrong.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from fractions import Fraction
from typing import Iterator

from app.domain.math.ast import (
    UNKNOWN_CODES, Add, Div, ErrorCode, Group, Linear, MathInputError, Mul, Neg, Node, Num, Var,
    contains_var, evaluate, fmt_fraction, fmt_term, top_terms,
)
from app.domain.math.parser import ParsedEquation, parse_equation, parse_expression


class Operation(StrEnum):
    ADD_BOTH_SIDES = "add_both_sides"
    SUBTRACT_BOTH_SIDES = "subtract_both_sides"
    MULTIPLY_BOTH_SIDES = "multiply_both_sides"
    DIVIDE_BOTH_SIDES = "divide_both_sides"
    TRANSPOSE_TERM = "transpose_term"
    EXPAND = "expand"
    COLLECT_LIKE_TERMS = "collect_like_terms"


VALUE_OPERATIONS = frozenset({Operation.ADD_BOTH_SIDES, Operation.SUBTRACT_BOTH_SIDES,
                              Operation.MULTIPLY_BOTH_SIDES, Operation.DIVIDE_BOTH_SIDES,
                              Operation.TRANSPOSE_TERM})


class SolutionKind(StrEnum):
    SINGLE = "single"
    NONE = "no_solution"
    INFINITE = "infinite_solutions"


class Status(StrEnum):
    VALID = "valid"
    INVALID = "invalid"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class Equation:
    lhs: Node
    rhs: Node

    @classmethod
    def parse(cls, text: str) -> "Equation":
        p: ParsedEquation = parse_equation(text)
        return cls(p.lhs, p.rhs)

    @property
    def left(self) -> Linear:
        return evaluate(self.lhs)

    @property
    def right(self) -> Linear:
        return evaluate(self.rhs)

    def normal(self) -> Linear:
        """A·x + B = 0 form."""
        return self.left - self.right

    def solution(self) -> tuple[SolutionKind, Fraction | None]:
        n = self.normal()
        if n.a != 0:
            return SolutionKind.SINGLE, -n.b / n.a
        return (SolutionKind.INFINITE, None) if n.b == 0 else (SolutionKind.NONE, None)

    def equivalent_to(self, other: "Equation") -> bool:
        return self.solution() == other.solution()


@dataclass(frozen=True)
class CheckResult:
    status: Status
    error_code: ErrorCode | None = None
    message: str = ""
    final_form: SolutionKind | None = None   # submitted equation is a finished conclusion form
    final_value: Fraction | None = None
    detail: dict = field(default_factory=dict)

    @property
    def math_status(self) -> str:
        return self.status.value


def _unknown_or_invalid(exc: MathInputError) -> CheckResult:
    status = Status.UNKNOWN if exc.code in UNKNOWN_CODES else Status.INVALID
    return CheckResult(status, exc.code, exc.message)


# ------------------------------------------------------------------ helpers
def _is_constant_literal(node: Node) -> bool:
    """Simplest numeric form: 6, -3, 1,5, 3/2 (reduced, denominator > 1)."""
    match node:
        case Num():
            return True
        case Neg(operand=o):
            return _is_constant_literal(o) and not isinstance(o, Neg)
        case Add(terms=((-1, o),)):
            return isinstance(o, (Num, Div)) and _is_constant_literal(o)
        case Div(left=Num(value=p), right=Num(value=q)):
            return (p.denominator == 1 and q.denominator == 1 and q > 1
                    and Fraction(p, q).denominator == q)
    return False


def _is_zero_x(node: Node) -> bool:
    return isinstance(node, Mul) and node.left == Num(Fraction(0)) and node.right == Var()


def _is_x_free_simple(node: Node) -> bool:
    """Side of a reduced 'no x' form: c, 0x, 0x + c."""
    if _is_constant_literal(node) or _is_zero_x(node):
        return True
    terms = top_terms(node)
    return (len(terms) == 2 and _is_zero_x(terms[0][1]) and terms[0][0] == 1
            and _is_constant_literal(terms[1][1] if terms[1][0] == 1 else Neg(terms[1][1])))


def final_form(eq: Equation) -> tuple[SolutionKind | None, Fraction | None]:
    """Is the equation a finished form? ``x = c`` (c simplest) or reduced ``0x = c``."""
    for var_side, other in ((eq.lhs, eq.rhs), (eq.rhs, eq.lhs)):
        if var_side == Var() and _is_constant_literal(other):
            return SolutionKind.SINGLE, evaluate(other).b
    if _is_x_free_simple(eq.lhs) and _is_x_free_simple(eq.rhs):
        kind, _ = eq.solution()
        return kind, None
    return None, None


def _group_flip_variants(node: Node) -> Iterator[Node]:
    """Copies of ``node`` with the sign of ONE term inside ONE bracket flipped."""
    match node:
        case Group(inner=inner):
            terms = top_terms(inner)
            if len(terms) > 1:
                for j in range(len(terms)):
                    flipped = tuple((-s if k == j else s, t) for k, (s, t) in enumerate(terms))
                    yield Group(Add(flipped))
            for v in _group_flip_variants(inner):
                yield Group(v)
        case Add(terms=terms):
            for j, (s, t) in enumerate(terms):
                for v in _group_flip_variants(t):
                    yield Add(tuple((s, v) if k == j else (s2, t2) for k, (s2, t2) in enumerate(terms)))
        case Neg(operand=o):
            for v in _group_flip_variants(o):
                yield Neg(v)
        case Mul(left=l, right=r):
            for v in _group_flip_variants(l):
                yield Mul(v, r)
            for v in _group_flip_variants(r):
                yield Mul(l, v)
        case Div(left=l, right=r):
            for v in _group_flip_variants(l):
                yield Div(v, r)


@dataclass(frozen=True)
class _Plan:
    """Expected sides plus sign-error variants for each side."""
    left: Linear
    right: Linear
    left_variants: tuple[Linear, ...]
    right_variants: tuple[Linear, ...]
    both_variant: tuple[Linear, Linear] | None  # opposite operation applied to both sides


def _side_variants(side: Node, k: Fraction, c: Linear, removed: Linear | None = None) -> tuple[Linear, ...]:
    """Sign-flip variants of k·side + c (minus ``removed`` term for transpose source)."""
    base = evaluate(side)
    expected = base.scale(k) + c
    out: list[Linear] = []
    for s, t in top_terms(side):
        tv = evaluate(t)
        tv = tv if s > 0 else -tv
        if removed is not None and tv == removed:
            continue
        out.append(expected - tv.scale(2 * k))
    if c != Linear(Fraction(0), Fraction(0)):
        out.append(expected - c.scale(2))
    for variant in _group_flip_variants(side):
        try:
            out.append(evaluate(variant).scale(k) + c)
        except MathInputError:
            continue
    return tuple(v for v in dict.fromkeys(out) if v != expected)


def _find_term(side: Node, t: Linear) -> bool:
    for s, node in top_terms(side):
        try:
            v = evaluate(node)
        except MathInputError:
            continue
        if (v if s > 0 else -v) == t:
            return True
    return False


class MathChecker:
    """Stateless, deterministic checker for one-variable linear equations."""

    # --------------------------------------------------------------- steps
    def check_step(self, base_equation: str, submitted_equation: str, operation: str,
                   operation_value: str | None = None) -> CheckResult:
        base = Equation.parse(base_equation)  # server-side, always parseable
        try:
            sub = Equation.parse(submitted_equation)
            sub_left, sub_right = sub.left, sub.right
        except MathInputError as exc:
            return _unknown_or_invalid(exc)

        try:
            op = Operation(operation)
        except ValueError:
            return CheckResult(Status.UNKNOWN, ErrorCode.OUT_OF_SCOPE, f"Thao tác không hỗ trợ: {operation}")

        try:
            plans = self._plans(base, op, operation_value)
        except MathInputError as exc:
            return _unknown_or_invalid(exc)
        if not plans:
            return CheckResult(Status.INVALID, ErrorCode.OPERATION_MISMATCH,
                               "Không tìm thấy hạng tử này trong phương trình")

        orientations = ((sub_left, sub_right), (sub_right, sub_left))
        for plan in plans:
            if any(l == plan.left and r == plan.right for l, r in orientations):
                kind, value = final_form(sub)
                return CheckResult(Status.VALID, final_form=kind, final_value=value)

        for plan in plans:  # SIGN_ERROR (highest priority)
            for l, r in orientations:
                if (l == plan.left and r in plan.right_variants) or (r == plan.right and l in plan.left_variants) \
                        or (plan.both_variant is not None and (l, r) == plan.both_variant):
                    return CheckResult(Status.INVALID, ErrorCode.SIGN_ERROR, "Có một dấu chưa đúng")
        for plan in plans:  # ARITHMETIC_ERROR
            for l, r in orientations:
                if l == plan.left or r == plan.right:
                    side = "phải" if l == plan.left else "trái"
                    return CheckResult(Status.INVALID, ErrorCode.ARITHMETIC_ERROR,
                                       f"Kiểm tra lại phép tính ở vế {side}",
                                       detail={"side": "right" if l == plan.left else "left"})
        if sub.equivalent_to(base):
            return CheckResult(Status.INVALID, ErrorCode.OPERATION_MISMATCH,
                               "Kết quả chưa khớp với thao tác em đã chọn")
        return CheckResult(Status.INVALID, ErrorCode.NON_EQUIVALENT, "Phương trình mới không tương đương")

    def _plans(self, base: Equation, op: Operation, value: str | None) -> list[_Plan]:
        one, zero = Fraction(1), Linear(Fraction(0), Fraction(0))
        if op in (Operation.EXPAND, Operation.COLLECT_LIKE_TERMS):
            return [self._plan(base, one, zero)]
        if value is None or not str(value).strip():
            raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Thiếu giá trị của thao tác")
        node = parse_expression(value)
        v = evaluate(node)
        if op == Operation.ADD_BOTH_SIDES:
            return [self._plan(base, one, v)]
        if op == Operation.SUBTRACT_BOTH_SIDES:
            return [self._plan(base, one, -v)]
        if op in (Operation.MULTIPLY_BOTH_SIDES, Operation.DIVIDE_BOTH_SIDES):
            if v.a != 0:
                raise MathInputError(ErrorCode.OUT_OF_SCOPE, "Nhân/chia hai vế cho biểu thức chứa x cần xét điều kiện")
            if v.b == 0:
                if op == Operation.DIVIDE_BOTH_SIDES:
                    raise MathInputError(ErrorCode.DIVISION_BY_ZERO, "Không được chia hai vế cho 0")
                raise MathInputError(ErrorCode.NON_EQUIVALENT, "Nhân hai vế với 0 làm mất nghiệm")
            k = v.b if op == Operation.MULTIPLY_BOTH_SIDES else 1 / v.b
            return [self._plan(base, k, zero)]
        # TRANSPOSE_TERM: value is one signed term as it appears on its source side
        if len(top_terms(node)) != 1 or (v.a != 0 and v.b != 0):
            raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Chuyển vế từng hạng tử một (ví dụ +5 hoặc -2x)")
        plans = []
        for src_is_left in (True, False):
            src = base.lhs if src_is_left else base.rhs
            if _find_term(src, v):
                plans.append(self._transpose_plan(base, v, src_is_left))
        return plans

    @staticmethod
    def _plan(base: Equation, k: Fraction, c: Linear) -> _Plan:
        left, right = base.left.scale(k) + c, base.right.scale(k) + c
        both = (base.left.scale(k) - c, base.right.scale(k) - c) if c != Linear(Fraction(0), Fraction(0)) else None
        return _Plan(left, right, _side_variants(base.lhs, k, c), _side_variants(base.rhs, k, c), both)

    @staticmethod
    def _transpose_plan(base: Equation, t: Linear, src_is_left: bool) -> _Plan:
        one = Fraction(1)
        src, dst = (base.lhs, base.rhs) if src_is_left else (base.rhs, base.lhs)
        src_val, dst_val = evaluate(src) - t, evaluate(dst) - t
        src_var = _side_variants(src, one, -t, removed=t)
        dst_var = _side_variants(dst, one, -t)
        if src_is_left:
            return _Plan(src_val, dst_val, src_var, dst_var, None)
        return _Plan(dst_val, src_val, dst_var, src_var, None)

    # ---------------------------------------------------------- planning
    def check_plan(self, original_equation: str, operation: str, operation_value: str | None) -> CheckResult:
        """Is the proposed first operation applicable (and non-degenerate) on the problem?"""
        base = Equation.parse(original_equation)
        try:
            op = Operation(operation)
        except ValueError:
            return CheckResult(Status.UNKNOWN, ErrorCode.OUT_OF_SCOPE, f"Thao tác không hỗ trợ: {operation}")
        try:
            plans = self._plans(base, op, operation_value)
        except MathInputError as exc:
            return _unknown_or_invalid(exc)
        if not plans:
            return CheckResult(Status.INVALID, ErrorCode.OPERATION_MISMATCH, "Không có hạng tử này trong đề")
        return CheckResult(Status.VALID)

    # ------------------------------------------------------- verification
    def verify_substitution(self, original_equation: str, x_value: Fraction, substitution: str) -> CheckResult:
        """Student writes the original equation with x replaced by their value, e.g. 2·6+5=17."""
        orig = Equation.parse(original_equation)
        try:
            sub = Equation.parse(substitution)
            sl, sr = sub.left, sub.right
        except MathInputError as exc:
            return _unknown_or_invalid(exc)
        if contains_var(sub.lhs) or contains_var(sub.rhs):
            return CheckResult(Status.INVALID, ErrorCode.OPERATION_MISMATCH, "Hãy thay x bằng giá trị em tìm được")
        want = (orig.left.at(x_value), orig.right.at(x_value))
        if (sl.b, sr.b) not in (want, want[::-1]):
            return CheckResult(Status.INVALID, ErrorCode.OPERATION_MISMATCH,
                               "Biểu thức chưa phải là phương trình ban đầu sau khi thay x")
        if contains_var(orig.lhs) or contains_var(orig.rhs):
            if abs(x_value) not in set(_literal_values(sub.lhs)) | set(_literal_values(sub.rhs)):
                return CheckResult(Status.INVALID, ErrorCode.OPERATION_MISMATCH,
                                   "Chưa thấy giá trị của x trong phép thay")
        if want[0] != want[1]:  # cannot happen when x_value came from valid steps
            return CheckResult(Status.INVALID, ErrorCode.NON_EQUIVALENT, "Giá trị này không thỏa mãn phương trình")
        return CheckResult(Status.VALID)

    def check_conclusion(self, current_equation: str, conclusion: str) -> CheckResult:
        """Conclusion for x-free reduced forms: no_solution / infinite_solutions."""
        try:
            claimed = SolutionKind(conclusion)
        except ValueError:
            return CheckResult(Status.UNKNOWN, ErrorCode.PARSE_UNKNOWN, "Kết luận không hợp lệ")
        if claimed == SolutionKind.SINGLE:
            return CheckResult(Status.UNKNOWN, ErrorCode.PARSE_UNKNOWN, "Kết luận một nghiệm dùng phép thay nghiệm")
        kind, _ = Equation.parse(current_equation).solution()
        if kind != claimed:
            return CheckResult(Status.INVALID, ErrorCode.NON_EQUIVALENT, "Kết luận chưa đúng với phương trình")
        return CheckResult(Status.VALID, final_form=kind)

    # ---------------------------------------------------------------- hints
    def suggest_next(self, equation: str) -> tuple[str, str | None]:
        """Strategy for the NEXT step (used for hint wording; never computes the result)."""
        eq = Equation.parse(equation)
        if _has_group(eq.lhs) or _has_group(eq.rhs):
            return "expand", None
        if _needs_collect(eq.lhs) or _needs_collect(eq.rhs):
            return "collect_like_terms", None
        kind, _ = final_form(eq)
        if kind == SolutionKind.SINGLE:
            return "verify", None
        if kind is not None:
            return "conclude", None
        lv, rv = eq.left, eq.right
        if lv.a != 0 and rv.a != 0:
            return "move_x_terms", fmt_term(Linear(rv.a, Fraction(0)))
        x_side, x_val = (eq.lhs, lv) if lv.a != 0 else (eq.rhs, rv)
        if x_val.b != 0:
            return "move_constants", fmt_term(Linear(Fraction(0), x_val.b))
        coef = x_val.a
        if coef != 1:
            return "divide_coefficient", fmt_fraction(coef)
        if not (lv.a == 0 and rv.a == 0):
            return "simplify", None  # e.g. x = 12/2
        return "collect_like_terms", None


def _literal_values(node: Node) -> Iterator[Fraction]:
    match node:
        case Num(value=v):
            yield abs(v)
        case Div(left=Num(value=p), right=Num(value=q)) if q != 0:
            yield abs(p / q)
            yield from (abs(p), abs(q))
        case Neg(operand=o) | Group(inner=o):
            yield from _literal_values(o)
        case Add(terms=t):
            for _, n in t:
                yield from _literal_values(n)
        case Mul(left=l, right=r) | Div(left=l, right=r):
            yield from _literal_values(l)
            yield from _literal_values(r)


def _has_group(node: Node) -> bool:
    match node:
        case Group():
            return True
        case Neg(operand=o):
            return _has_group(o)
        case Add(terms=t):
            return any(_has_group(n) for _, n in t)
        case Mul(left=l, right=r) | Div(left=l, right=r):
            return _has_group(l) or _has_group(r)
    return False


def _needs_collect(node: Node) -> bool:
    terms = top_terms(node)
    x_terms = const_terms = 0
    for _, t in terms:
        if contains_var(t):
            x_terms += 1
        else:
            const_terms += 1
    if x_terms > 1 or const_terms > 1:
        return True
    # unsimplified single terms such as 12/2 or 2·3x
    return any(not (_is_constant_literal(t) or _is_simple_x_term(t)) for _, t in terms)


def _is_simple_x_term(node: Node) -> bool:
    return node == Var() or (isinstance(node, Mul) and _is_constant_literal(node.left) and node.right == Var())
