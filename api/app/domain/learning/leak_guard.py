"""Answer-leak guard for outgoing tutor text (templates now, AI output in Phase 3).

Conservative lexical check — NOT a proof of safety (handoff §6.4: "Không bảo
đảm quy tắc không đáp án chỉ bằng prompt hoặc regex đơn giản"). It blocks:

* an explicit statement ``x = <solution>`` (any spacing, VN/EN number format);
* the bare solution number, unless that number already appears in the text
  the student is looking at (problem statement / current equation), because
  then it is a coefficient, not a revealed answer.
"""
from __future__ import annotations

import re
from fractions import Fraction

_NUM_RE = re.compile(r"(?<![\d,/])-?\d+(?:,\d+)?(?:/\d+)?(?![\d,/])")


def _as_fraction(token: str) -> Fraction | None:
    try:
        return Fraction(token.replace(",", "."))
    except (ValueError, ZeroDivisionError):
        return None


def number_tokens(text: str) -> set[Fraction]:
    return {f for t in _NUM_RE.findall(text) if (f := _as_fraction(t)) is not None}


def leaks_answer(text: str, solution: Fraction | None, visible_context: str = "") -> bool:
    if solution is None:
        return False
    if re.search(r"x\s*=\s*-?\s*\d", text):
        for m in re.finditer(r"x\s*=\s*(-?\s*\d+(?:,\d+)?(?:/\d+)?)", text):
            if _as_fraction(m.group(1).replace(" ", "")) == solution:
                return True
    present = number_tokens(text)
    allowed = number_tokens(visible_context) | {abs(n) for n in number_tokens(visible_context)}
    return any(n in (solution, -solution) and n not in allowed and abs(n) not in allowed for n in present)
