"""Problem bank: problems, versioned statements, approval.

* Only the author edits their own **draft**; approved versions are immutable
  (DB trigger) — changes go into a new version.
* Two read models: ``get_version_internal`` (teacher/MathChecker, includes
  ``teacher_solution`` and ``hints``) and ``get_version_for_student``
  (statement only). Students never receive solution or internal hints.
"""
from __future__ import annotations

import json
import sqlite3

from app.domain.constants import MAX_HINT_LEVEL, REQUIRED_MATH_SPEC_KEYS, Difficulty, Role
from app.domain.errors import NotFound, PermissionDenied, StateConflict, ValidationFailed
from app.infrastructure.sqlite.connection import transaction
from app.infrastructure.sqlite.repositories._common import (
    audit, dumps, iso, new_id, require_active_role, require_text, row, utc_now,
)

STUDENT_VERSION_COLUMNS = "problem_id, version, statement, difficulty"


def validate_math_spec(spec: dict) -> dict:
    if not isinstance(spec, dict):
        raise ValidationFailed("math_spec must be an object")
    missing = REQUIRED_MATH_SPEC_KEYS - spec.keys()
    if missing:
        raise ValidationFailed(f"math_spec missing keys: {sorted(missing)}")
    for k in REQUIRED_MATH_SPEC_KEYS:
        require_text(f"math_spec.{k}", spec[k], max_len=200)
    return spec


def validate_hints(hints: list) -> list:
    """Exactly one teacher-approved template per hint level 1..3."""
    if not isinstance(hints, list) or len(hints) != MAX_HINT_LEVEL:
        raise ValidationFailed(f"hints must be a list of {MAX_HINT_LEVEL} strings (levels 1..{MAX_HINT_LEVEL})")
    return [require_text(f"hints[{i}]", h, max_len=500) for i, h in enumerate(hints)]


class ContentRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create_problem(self, *, author_id: str, topic_id: str) -> str:
        require_active_role(self.conn, author_id, Role.TEACHER)
        pid = new_id()
        with transaction(self.conn):
            self.conn.execute("INSERT INTO problems(id, topic_id, author_id) VALUES(?,?,?)", (pid, topic_id, author_id))
        return pid

    def _require_author(self, problem_id: str, author_id: str) -> None:
        require_active_role(self.conn, author_id, Role.TEACHER)
        p = self.conn.execute("SELECT author_id FROM problems WHERE id=?", (problem_id,)).fetchone()
        if p is None:
            raise NotFound("Problem not found")
        if p["author_id"] != author_id:
            raise PermissionDenied("Only the author can edit drafts of this problem")

    def create_version(self, *, author_id: str, problem_id: str, statement: str, math_spec: dict,
                       teacher_solution: str, hints: list[str], difficulty: Difficulty | str) -> int:
        self._require_author(problem_id, author_id)
        if str(difficulty) not in {d.value for d in Difficulty}:
            raise ValidationFailed("difficulty invalid")
        with transaction(self.conn):
            version = self.conn.execute(
                "SELECT coalesce(max(version),0)+1 FROM problem_versions WHERE problem_id=?", (problem_id,)
            ).fetchone()[0]
            self.conn.execute(
                "INSERT INTO problem_versions(problem_id, version, statement, math_spec, teacher_solution, hints, difficulty)"
                " VALUES(?,?,?,?,?,?,?)",
                (problem_id, version, require_text("statement", statement, max_len=1000),
                 dumps(validate_math_spec(math_spec)), require_text("teacher_solution", teacher_solution, max_len=4000),
                 dumps(validate_hints(hints)), str(difficulty)))
        return version

    def update_draft(self, *, author_id: str, problem_id: str, version: int, **fields) -> None:
        self._require_author(problem_id, author_id)
        allowed = {"statement", "math_spec", "teacher_solution", "hints", "difficulty"}
        if not fields or set(fields) - allowed:
            raise ValidationFailed(f"Updatable fields: {sorted(allowed)}")
        if "math_spec" in fields:
            fields["math_spec"] = dumps(validate_math_spec(fields["math_spec"]))
        if "hints" in fields:
            fields["hints"] = dumps(validate_hints(fields["hints"]))
        sets = ", ".join(f"{k}=?" for k in fields)  # keys whitelisted above
        with transaction(self.conn):
            cur = self.conn.execute(
                f"UPDATE problem_versions SET {sets} WHERE problem_id=? AND version=? AND approval_status='draft'",
                (*fields.values(), problem_id, version))
            if cur.rowcount == 0:
                raise StateConflict("Only existing draft versions can be edited")

    def approve_version(self, *, approver_id: str, problem_id: str, version: int) -> None:
        require_active_role(self.conn, approver_id, Role.TEACHER)
        with transaction(self.conn):
            cur = self.conn.execute(
                "UPDATE problem_versions SET approval_status='approved', approved_by=?, approved_at=?"
                " WHERE problem_id=? AND version=? AND approval_status='draft'",
                (approver_id, iso(utc_now()), problem_id, version))
            if cur.rowcount == 0:
                raise StateConflict("Version not found or already approved")
            audit(self.conn, actor_id=approver_id, action="problem.approve", entity_type="problem_version",
                  entity_id=f"{problem_id}@{version}")

    def get_version_internal(self, problem_id: str, version: int) -> dict:
        v = row(self.conn.execute("SELECT * FROM problem_versions WHERE problem_id=? AND version=?",
                                  (problem_id, version)).fetchone())
        if v is None:
            raise NotFound("Problem version not found")
        v["math_spec"] = json.loads(v["math_spec"])
        v["hints"] = json.loads(v["hints"])
        return v

    def get_version_for_student(self, problem_id: str, version: int) -> dict:
        v = row(self.conn.execute(
            f"SELECT {STUDENT_VERSION_COLUMNS} FROM problem_versions"
            " WHERE problem_id=? AND version=? AND approval_status='approved'", (problem_id, version)).fetchone())
        if v is None:
            raise NotFound("Problem version not found")
        return v
