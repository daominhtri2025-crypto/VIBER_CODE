"""Whitelist parser for student input (handoff §5.4, decisions Q1–Q2).

Accepted notation (Vietnamese classroom conventions)
----------------------------------------------------
* Variable ``x`` (``X`` is normalised to ``x``). Any other letter -> OUT_OF_SCOPE.
* Decimal comma: ``0,5``. The dot ``.`` is **only** multiplication; a dot
  between two digits (``2.5``) is rejected as ambiguous (PARSE_UNKNOWN) rather
  than silently read as 2·5.
* Multiplication: ``*  ×  ·  ⋅  ∙  .`` and implicit (``2x``, ``3(x-1)``,
  ``x(2+1)``, ``(x+1)2`` is rejected).
* Division: ``/  :  ÷``. Implicit multiplication has the same precedence as
  explicit, left-to-right: ``1/2x`` = (1/2)·x.
* Brackets ``() [] {}``; minus signs ``- − – —``; power ``^`` (constant
  integer exponent 0..6; ``x^2`` -> OUT_OF_SCOPE).
* Exactly one ``=`` in an equation.

Resource limits replace a wall-clock timeout: input length, token count,
nesting depth and number size are bounded, and parsing is linear in tokens.
A monotonic deadline is still checked as defence in depth.
"""
from __future__ import annotations

import re
import time
import unicodedata
from dataclasses import dataclass
from fractions import Fraction

from app.domain.math.ast import (
    Add, Div, ErrorCode, Group, MathInputError, Mul, Neg, Node, Num, Pow, Var,
)

MAX_INPUT_LEN = 200
MAX_TOKENS = 120
MAX_DEPTH = 25
MAX_DIGITS = 12
DEADLINE_SECONDS = 0.05

_TRANSLATE = str.maketrans({
    "−": "-", "–": "-", "—": "-", "‐": "-",
    "×": "*", "·": "*", "⋅": "*", "∙": "*", ".": "*",
    "÷": "/", ":": "/",
    "[": "(", "{": "(", "]": ")", "}": ")",
    "X": "x",
})
_OUT_OF_SCOPE_CHARS = set("<>≤≥≠√∛|!%∞π")
_SUPERSCRIPTS = set("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻")  # checked BEFORE NFKC, which would turn x² into x2
_TOKEN_RE = re.compile(r"\s*(?:(?P<num>\d+(?:,\d+)?)|(?P<var>x)|(?P<op>[-+*/^=()]))")


@dataclass(frozen=True)
class Token:
    kind: str  # NUM VAR OP
    text: str
    value: Fraction | None = None


def normalize(raw: str) -> str:
    if not isinstance(raw, str):
        raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Đầu vào phải là chuỗi")
    if len(raw) > MAX_INPUT_LEN:
        raise MathInputError(ErrorCode.PARSE_UNKNOWN, f"Đầu vào dài quá {MAX_INPUT_LEN} ký tự")
    if any(ch in _SUPERSCRIPTS for ch in raw):
        raise MathInputError(ErrorCode.OUT_OF_SCOPE, "Lũy thừa (chỉ số trên) nằm ngoài phương trình bậc nhất")
    s = unicodedata.normalize("NFKC", raw).strip()
    if not s:
        raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Đầu vào rỗng")
    if re.search(r"\d\s*\.\s*\d", s):
        raise MathInputError(ErrorCode.PARSE_UNKNOWN,
                             "Dấu chấm giữa hai chữ số không rõ nghĩa; số thập phân dùng dấu phẩy (0,5)")
    if re.search(r"\d\s+\d", s):
        raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Hai số đứng cạnh nhau không có phép toán")
    if any(ch in _OUT_OF_SCOPE_CHARS for ch in s):
        raise MathInputError(ErrorCode.OUT_OF_SCOPE, "Ký hiệu ngoài phạm vi phương trình bậc nhất")
    return s.translate(_TRANSLATE)


def tokenize(s: str) -> list[Token]:
    tokens: list[Token] = []
    pos = 0
    while pos < len(s):
        if s[pos].isspace():
            pos += 1
            continue
        m = _TOKEN_RE.match(s, pos)
        if not m:
            ch = s[pos]
            code = ErrorCode.OUT_OF_SCOPE if ch.isalpha() else ErrorCode.PARSE_UNKNOWN
            msg = (f"Chỉ hỗ trợ một ẩn x (gặp '{ch}')" if ch.isalpha() else f"Ký tự không hỗ trợ: '{ch}'")
            raise MathInputError(code, msg)
        if m.group("num"):
            text = m.group("num")
            if len(text.replace(",", "")) > MAX_DIGITS:
                raise MathInputError(ErrorCode.OUT_OF_SCOPE, "Số có quá nhiều chữ số")
            tokens.append(Token("NUM", text, Fraction(text.replace(",", "."))))
        elif m.group("var"):
            tokens.append(Token("VAR", "x"))
        else:
            tokens.append(Token("OP", m.group("op")))
        pos = m.end()
        if len(tokens) > MAX_TOKENS:
            raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Biểu thức quá dài")
    return tokens


class _Parser:
    def __init__(self, tokens: list[Token]):
        self.t = tokens
        self.i = 0
        self.depth = 0
        self.deadline = time.monotonic() + DEADLINE_SECONDS

    # -- helpers ---------------------------------------------------------
    def peek(self) -> Token | None:
        return self.t[self.i] if self.i < len(self.t) else None

    def is_op(self, *ops: str) -> bool:
        tok = self.peek()
        return tok is not None and tok.kind == "OP" and tok.text in ops

    def take(self) -> Token:
        if time.monotonic() > self.deadline:
            raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Phân tích quá thời gian cho phép")
        tok = self.peek()
        if tok is None:
            raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Biểu thức kết thúc đột ngột")
        self.i += 1
        return tok

    def enter(self) -> None:
        self.depth += 1
        if self.depth > MAX_DEPTH:
            raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Lồng ngoặc quá sâu")

    # -- grammar ---------------------------------------------------------
    # expr   := [+|-] term (( + | - ) term)*
    # term   := factor (( * | / | <implicit> ) factor)*
    # factor := ( + | - ) factor | power
    # power  := atom ( ^ factor )?
    # atom   := NUM | x | ( expr )
    def expr(self) -> Node:
        self.enter()
        terms: list[tuple[int, Node]] = []
        sign = 1
        if self.is_op("+", "-"):
            sign = -1 if self.take().text == "-" else 1
        terms.append((sign, self.term()))
        while self.is_op("+", "-"):
            sign = -1 if self.take().text == "-" else 1
            terms.append((sign, self.term()))
        self.depth -= 1
        if len(terms) == 1 and terms[0][0] == 1:
            return terms[0][1]
        return Add(tuple(terms))

    def term(self) -> Node:
        node = self.factor()
        while True:
            tok = self.peek()
            if tok is None:
                return node
            if tok.kind == "OP" and tok.text in "*/":
                op = self.take().text
                rhs = self.factor()
                node = Mul(node, rhs) if op == "*" else Div(node, rhs)
            elif tok.kind == "VAR" or (tok.kind == "OP" and tok.text == "("):
                node = Mul(node, self.factor())  # implicit: 2x, 3(x+1), x(2), (x+1)(x-1)
            elif tok.kind == "NUM":
                raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Số đứng sau x hoặc ngoặc cần dấu nhân")
            else:
                return node

    def factor(self) -> Node:
        if self.is_op("+", "-"):
            self.enter()
            neg = self.take().text == "-"
            inner = self.factor()
            self.depth -= 1
            return Neg(inner) if neg else inner
        return self.power()

    def power(self) -> Node:
        base = self.atom()
        if self.is_op("^"):
            self.take()
            return Pow(base, self.factor())
        return base

    def atom(self) -> Node:
        tok = self.take()
        if tok.kind == "NUM":
            return Num(tok.value)
        if tok.kind == "VAR":
            return Var()
        if tok.text == "(":
            if self.is_op(")"):
                raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Cặp ngoặc rỗng")
            inner = self.expr()
            if not self.is_op(")"):
                raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Thiếu dấu đóng ngoặc")
            self.take()
            return Group(inner)
        raise MathInputError(ErrorCode.PARSE_UNKNOWN, f"Không mong đợi '{tok.text}'")


def _parse_tokens(tokens: list[Token]) -> Node:
    if not tokens:
        raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Thiếu biểu thức")
    p = _Parser(tokens)
    node = p.expr()
    if p.peek() is not None:
        raise MathInputError(ErrorCode.PARSE_UNKNOWN, f"Thừa ký hiệu '{p.peek().text}'")
    return node


@dataclass(frozen=True)
class ParsedEquation:
    lhs: Node
    rhs: Node
    source: str


def parse_expression(raw: str) -> Node:
    tokens = tokenize(normalize(raw))
    if any(t.kind == "OP" and t.text == "=" for t in tokens):
        raise MathInputError(ErrorCode.PARSE_UNKNOWN, "Biểu thức không được chứa dấu '='")
    return _parse_tokens(tokens)


def parse_equation(raw: str) -> ParsedEquation:
    tokens = tokenize(normalize(raw))
    eq = [i for i, t in enumerate(tokens) if t.kind == "OP" and t.text == "="]
    if len(eq) != 1:
        raise MathInputError(ErrorCode.PARSE_UNKNOWN,
                             "Phương trình phải có đúng một dấu '='" if eq else "Thiếu dấu '='")
    k = eq[0]
    return ParsedEquation(_parse_tokens(tokens[:k]), _parse_tokens(tokens[k + 1:]), raw)
