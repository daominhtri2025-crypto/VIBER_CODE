"""Shared fixtures. Every test works on a temporary copy — never on a live DB."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.infrastructure.sqlite.connection import connect
from app.infrastructure.sqlite.migrations import BASELINE_DIR, initialize

SHIPPED_DEMO_DB = BASELINE_DIR / "data" / "math_tutor_demo.db"


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    """New database: baseline v1 + demo seed, migrated to latest."""
    return initialize(tmp_path / "app.db", demo=True)


@pytest.fixture
def conn(db_path: Path):
    c = connect(db_path)
    yield c
    c.close()


@pytest.fixture
def legacy_db(tmp_path: Path) -> Path:
    """Byte-faithful copy (backup API) of the shipped v1 demo database."""
    target = tmp_path / "legacy_v1.db"
    src = sqlite3.connect(f"file:{SHIPPED_DEMO_DB}?mode=ro", uri=True)
    dst = sqlite3.connect(target)
    src.backup(dst)
    src.close()
    dst.close()
    return target


def raw_exec(conn: sqlite3.Connection, sql: str, args: tuple = ()) -> None:
    """Execute one statement in its own transaction (bypassing repositories)."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(sql, args)
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


@pytest.fixture
def env(tmp_path):
    """API test environment (FastAPI TestClient + mock AI + local Google keys)."""
    from tests.api_fixtures import build_env
    return build_env(tmp_path)
