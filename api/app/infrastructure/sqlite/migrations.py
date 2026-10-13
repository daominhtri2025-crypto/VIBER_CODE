"""Versioned migration runner for the SQLite database.

Design
------
* **Baseline v1** is the unchanged ``database/math_tutor_db/schema.sql``; new
  databases are created from it (plus the four roles, optional demo seed) and
  then migrated forward. Existing databases are *never* re-created.
* **Migrations** live in ``database/migrations/NNNN_<name>.sql`` (NNNN >= 2).
  Each file is executed inside one ``BEGIN IMMEDIATE`` transaction; the runner
  checks ``integrity_check`` and ``foreign_key_check`` *before* ``COMMIT``
  and rolls back on any failure, so a migration is all-or-nothing.
* A **backup** (SQLite backup API) is written before the first pending
  migration is applied to a file database.
* Applied migrations store a SHA-256 checksum; editing an applied file is
  detected (``MigrationError``) instead of silently diverging.
* A database newer than the code (unknown higher version) is refused.
"""
from __future__ import annotations

import hashlib
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.infrastructure.sqlite.connection import backup, connect, enable_wal, health_check

REPO_ROOT = Path(__file__).resolve().parents[4]
BASELINE_DIR = REPO_ROOT / "database" / "math_tutor_db"
MIGRATIONS_DIR = REPO_ROOT / "database" / "migrations"
DEFAULT_ROLES = ("student", "teacher", "researcher", "admin")
_FILE_RE = re.compile(r"^(\d{4})_([a-z0-9_]+)\.sql$")


class MigrationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    path: Path

    @property
    def sql(self) -> str:
        return self.path.read_text(encoding="utf-8")

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.path.read_bytes()).hexdigest()


def discover(migrations_dir: Path = MIGRATIONS_DIR) -> list[Migration]:
    found: list[Migration] = []
    for path in sorted(migrations_dir.glob("*.sql")):
        m = _FILE_RE.match(path.name)
        if not m:
            raise MigrationError(f"Bad migration filename: {path.name}")
        found.append(Migration(int(m.group(1)), m.group(2), path))
    versions = [m.version for m in found]
    if len(set(versions)) != len(versions):
        raise MigrationError("Duplicate migration version")
    if versions and versions != list(range(2, 2 + len(versions))):
        raise MigrationError(f"Migrations must be contiguous from 0002, got {versions}")
    return found


def current_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT coalesce(max(version), 0) FROM schema_migrations").fetchone()
    return int(row[0])


def _applied_checksums(conn: sqlite3.Connection) -> dict[int, str | None]:
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(schema_migrations)")}
    if "checksum" not in cols:
        return {}
    return {r["version"]: r["checksum"] for r in conn.execute("SELECT version, checksum FROM schema_migrations")}


def status(conn: sqlite3.Connection, migrations: list[Migration] | None = None) -> dict:
    migrations = discover() if migrations is None else migrations
    version = current_version(conn)
    latest = max([1] + [m.version for m in migrations])
    return {
        "current_version": version,
        "latest_version": latest,
        "pending": [m.version for m in migrations if m.version > version],
    }


def _verify_applied(conn: sqlite3.Connection, migrations: list[Migration]) -> None:
    known = {m.version: m for m in migrations}
    version = current_version(conn)
    if version > max([1, *known]):
        raise MigrationError(f"Database version {version} is newer than this code ({max([1, *known])})")
    for v, checksum in _applied_checksums(conn).items():
        if v in known and checksum is not None and checksum != known[v].checksum:
            raise MigrationError(f"Applied migration {v:04d} was modified after being applied")


def _apply_one(conn: sqlite3.Connection, m: Migration) -> None:
    # executescript runs our explicit BEGIN; the transaction stays open after
    # the script so that checks can run before COMMIT.
    try:
        conn.executescript("BEGIN IMMEDIATE;\n" + m.sql)
        report = health_check(conn)
        if not report["ok"]:
            raise MigrationError(f"Post-migration check failed: {report}")
        conn.execute(
            "INSERT INTO schema_migrations(version, name, checksum) VALUES(?,?,?)",
            (m.version, m.name, m.checksum),
        )
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise


def migrate(db_path: str | Path, *, backup_dir: str | Path | None = None,
            target: int | None = None, migrations: list[Migration] | None = None,
            make_backup: bool = True) -> dict:
    """Bring ``db_path`` up to ``target`` (default: latest). Idempotent."""
    migrations = discover() if migrations is None else migrations
    conn = connect(db_path)
    try:
        _verify_applied(conn, migrations)
        start = current_version(conn)
        pending = [m for m in migrations if m.version > start and (target is None or m.version <= target)]
        backup_path = None
        if pending and make_backup:
            bdir = Path(backup_dir) if backup_dir else Path(db_path).resolve().parent / "backups"
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            backup_path = backup(conn, bdir / f"{Path(db_path).stem}_v{start}_{stamp}.db")
        for m in pending:
            _apply_one(conn, m)
        enable_wal(conn)
        return {"from_version": start, "to_version": current_version(conn),
                "applied": [m.version for m in pending], "backup": str(backup_path) if backup_path else None}
    finally:
        conn.close()


def initialize(db_path: str | Path, *, demo: bool = False, migrate_to_latest: bool = True,
               baseline_dir: Path = BASELINE_DIR) -> Path:
    """Create a NEW database from baseline v1 (+ seed) then migrate forward.

    Mirrors ``math_tutor_db/init_db.py`` but goes through this connection
    factory; refuses to overwrite an existing file.
    """
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with db_path.open("xb"):
        pass  # exclusive create: FileExistsError if it already exists
    conn = connect(db_path)
    try:
        conn.executescript("BEGIN IMMEDIATE;\n" + (baseline_dir / "schema.sql").read_text(encoding="utf-8") + "\nCOMMIT;")
        conn.execute("BEGIN IMMEDIATE")
        conn.executemany("INSERT INTO roles(code) VALUES(?)", [(r,) for r in DEFAULT_ROLES])
        conn.execute("COMMIT")
        if demo:
            conn.executescript("BEGIN IMMEDIATE;\n" + (baseline_dir / "seed.sql").read_text(encoding="utf-8") + "\nCOMMIT;")
        report = health_check(conn)
        if not report["ok"]:
            raise MigrationError(f"Baseline check failed: {report}")
        enable_wal(conn)
    finally:
        conn.close()
    if migrate_to_latest:
        # A brand-new database holds nothing to lose: no pre-migration backup.
        migrate(db_path, make_backup=False)
    return db_path
