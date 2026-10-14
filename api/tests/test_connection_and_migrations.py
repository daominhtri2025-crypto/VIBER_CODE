"""Connection factory + migration runner (acceptance: integrity, preservation, backup/restore)."""
from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

import pytest

from app.domain.errors import IntegrityViolation
from app.infrastructure.sqlite import migrations as mig
from app.infrastructure.sqlite.connection import backup, connect, health_check, transaction
from tests.conftest import raw_exec

LATEST = max(m.version for m in mig.discover())

# Tables whose content is research history and must survive migration byte-for-byte.
HISTORY_QUERIES = {
    "solution_steps": "SELECT * FROM solution_steps ORDER BY id",
    "hint_events": "SELECT id, session_id, step_id, hint_level, trigger, content, created_at FROM hint_events ORDER BY id",
    "item_responses": "SELECT * FROM item_responses ORDER BY id",
    "learning_sessions": "SELECT id, student_id, problem_id, problem_version, assignment_id, ai_config_id,"
                         " learning_mode, state, version, started_at, completed_at FROM learning_sessions ORDER BY id",
    "assessment_totals": "SELECT * FROM assessment_totals ORDER BY attempt_id",
    "session_summary": "SELECT * FROM session_summary ORDER BY id",
}


def snapshot(path: Path) -> dict:
    c = connect(path)
    try:
        tables = [r[0] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('schema_migrations') ORDER BY name")]
        snap = {f"count:{t}": c.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in tables}
        snap.update({k: [tuple(r) for r in c.execute(q)] for k, q in HISTORY_QUERIES.items()})
        return snap
    finally:
        c.close()


# ---------------------------------------------------------------- connection
def test_connection_pragmas(conn):
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"


def test_connect_does_not_create_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        connect(tmp_path / "typo.db")
    assert not (tmp_path / "typo.db").exists()


def test_nested_transaction_rejected(conn):
    with transaction(conn):
        with pytest.raises(RuntimeError):
            with transaction(conn):
                pass


def test_constraint_failure_rolls_back_whole_transaction(conn):
    before = conn.execute("SELECT count(*) FROM users").fetchone()[0]
    with pytest.raises(IntegrityViolation):
        with transaction(conn):
            conn.execute("INSERT INTO users(id, display_name) VALUES('tmp-user','x')")
            conn.execute("INSERT INTO class_members VALUES('class-demo','missing-student')")  # FK fails
    assert conn.execute("SELECT count(*) FROM users").fetchone()[0] == before
    assert not conn.in_transaction


def test_health_check_ok(conn):
    report = health_check(conn)
    assert report["ok"] and report["integrity_check"] == "ok" and report["foreign_key_violations"] == []


def test_backup_refuses_overwrite(db_path, tmp_path):
    out = backup(db_path, tmp_path / "b.db")
    with pytest.raises(FileExistsError):
        backup(db_path, out)


# ---------------------------------------------------------------- migrations
def test_new_database_is_latest_and_has_v2_objects(conn):
    assert mig.status(conn) == {"current_version": LATEST, "latest_version": LATEST, "pending": []}
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(learning_sessions)")}
    assert {"parent_session_id", "study_id"} <= cols
    assert "request_id" in {r["name"] for r in conn.execute("PRAGMA table_info(hint_events)")}
    assert conn.execute("SELECT 1 FROM sqlite_master WHERE name='audit_log'").fetchone()


def test_init_never_overwrites(db_path):
    with pytest.raises(FileExistsError):
        mig.initialize(db_path)


def test_migrating_shipped_v1_preserves_history_and_scores(legacy_db, tmp_path):
    before = snapshot(legacy_db)
    result = mig.migrate(legacy_db, backup_dir=tmp_path / "bk")
    assert result["from_version"] == 1 and result["to_version"] == LATEST
    assert result["applied"] == list(range(2, LATEST + 1))
    after = snapshot(legacy_db)
    new_tables = set(after) - set(before)  # created by later migrations: must exist empty
    assert {"count:audit_log", "count:erasure_requests", "count:ai_usage"} <= new_tables
    assert {k: v for k, v in after.items() if k not in new_tables} == before
    assert all(after[k] == 0 for k in new_tables)
    c = connect(legacy_db)
    try:
        assert health_check(c)["ok"]
        # legacy hints keep NULL request_id; nothing was invented
        assert c.execute("SELECT count(*) FROM hint_events WHERE request_id IS NOT NULL").fetchone()[0] == 0
    finally:
        c.close()


def test_backup_is_restorable_v1(legacy_db, tmp_path):
    before = snapshot(legacy_db)
    result = mig.migrate(legacy_db, backup_dir=tmp_path / "bk")
    restored = tmp_path / "restored.db"
    shutil.copyfile(result["backup"], restored)  # backup file is self-contained (not WAL)
    c = connect(restored)
    try:
        assert mig.current_version(c) == 1
        assert health_check(c)["ok"]
    finally:
        c.close()
    assert snapshot(restored) == before


def test_migrate_is_idempotent(legacy_db, tmp_path):
    mig.migrate(legacy_db, backup_dir=tmp_path / "bk")
    again = mig.migrate(legacy_db, backup_dir=tmp_path / "bk")
    assert again["applied"] == [] and again["backup"] is None


def _copy_migrations(tmp_path: Path) -> Path:
    d = tmp_path / "migs"
    shutil.copytree(mig.MIGRATIONS_DIR, d)
    return d


def test_tampered_applied_migration_is_detected(legacy_db, tmp_path):
    d = _copy_migrations(tmp_path)
    mig.migrate(legacy_db, backup_dir=tmp_path / "bk", migrations=mig.discover(d))
    f = next(d.glob("0003_*.sql"))
    f.write_text(f.read_text(encoding="utf-8") + "\n-- edited later\n", encoding="utf-8")
    with pytest.raises(mig.MigrationError, match="modified"):
        mig.migrate(legacy_db, migrations=mig.discover(d))


def test_failing_migration_rolls_back_completely(legacy_db, tmp_path):
    d = _copy_migrations(tmp_path)
    (d / f"{LATEST + 1:04d}_broken.sql").write_text(
        "ALTER TABLE users ADD COLUMN nickname TEXT;\nINSERT INTO no_such_table VALUES(1);\n", encoding="utf-8")
    with pytest.raises(sqlite3.OperationalError):
        mig.migrate(legacy_db, backup_dir=tmp_path / "bk", migrations=mig.discover(d))
    c = connect(legacy_db)
    try:
        # every real migration committed on its own; the broken one left no trace.
        assert mig.current_version(c) == LATEST
        assert "nickname" not in {r["name"] for r in c.execute("PRAGMA table_info(users)")}
    finally:
        c.close()


def test_database_newer_than_code_is_refused(db_path):
    c = connect(db_path)
    raw_exec(c, "INSERT INTO schema_migrations(version, name) VALUES(99,'future')")
    c.close()
    with pytest.raises(mig.MigrationError, match="newer"):
        mig.migrate(db_path)


def test_migration_files_are_contiguous():
    assert [m.version for m in mig.discover()] == list(range(2, LATEST + 1)) and LATEST >= 5
