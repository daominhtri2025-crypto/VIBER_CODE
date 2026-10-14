"""SQLite connection factory and transaction helpers.

Rules enforced here (handoff §4.4, §9.1):

* ``PRAGMA foreign_keys=ON`` on **every** connection and verified, because the
  setting is per-connection and silently defaults to OFF.
* ``busy_timeout`` so a second writer waits instead of failing immediately
  (WAL still allows only one writer at a time).
* WAL is a persistent database property; it is set by ``enable_wal`` at
  initialisation/migration time, not on every connect.
* Connections run in autocommit mode (``isolation_level=None``); every write
  goes through :func:`transaction`, which issues an explicit
  ``BEGIN IMMEDIATE`` so the write lock is taken up-front and optimistic
  version checks happen under that lock.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.domain.errors import IntegrityViolation

MIN_SQLITE_VERSION = (3, 38, 0)  # JSON functions are built in from 3.38
DEFAULT_BUSY_TIMEOUT_MS = 5000


def check_runtime() -> None:
    """Fail fast if the linked SQLite library is too old for the schema."""
    if sqlite3.sqlite_version_info < MIN_SQLITE_VERSION:
        raise RuntimeError(
            f"SQLite >= {'.'.join(map(str, MIN_SQLITE_VERSION))} required, "
            f"found {sqlite3.sqlite_version}"
        )


def connect(path: str | Path, *, busy_timeout_ms: int = DEFAULT_BUSY_TIMEOUT_MS,
            must_exist: bool = True, check_same_thread: bool = True) -> sqlite3.Connection:
    """Open a hardened connection for trusted backend code.

    ``must_exist=True`` prevents ``sqlite3.connect`` from silently creating an
    empty database when a path is mistyped.
    """
    check_runtime()
    if must_exist and str(path) != ":memory:" and not Path(path).is_file():
        raise FileNotFoundError(f"Database not found: {path}")
    conn = sqlite3.connect(str(path), timeout=busy_timeout_ms / 1000,
                           isolation_level=None, check_same_thread=check_same_thread)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute(f"PRAGMA busy_timeout={int(busy_timeout_ms)}")
    if conn.execute("PRAGMA foreign_keys").fetchone()[0] != 1:
        conn.close()
        raise RuntimeError("Could not enable foreign_keys on connection")
    return conn


def enable_wal(conn: sqlite3.Connection) -> str:
    """Switch to WAL (persistent) with the recommended synchronous level."""
    mode = conn.execute("PRAGMA journal_mode=WAL").fetchone()[0]
    conn.execute("PRAGMA synchronous=NORMAL")
    return mode


@contextmanager
def transaction(conn: sqlite3.Connection, *, immediate: bool = True) -> Iterator[sqlite3.Connection]:
    """Short explicit transaction; translates constraint failures.

    Nested use is rejected on purpose: each repository mutation owns exactly
    one short transaction, and network/AI calls must never run inside it.
    """
    if conn.in_transaction:
        raise RuntimeError("Nested transaction: the caller already holds one")
    conn.execute("BEGIN IMMEDIATE" if immediate else "BEGIN DEFERRED")
    try:
        yield conn
    except sqlite3.IntegrityError as exc:
        conn.execute("ROLLBACK")
        raise IntegrityViolation(str(exc)) from exc
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def backup(source: sqlite3.Connection | str | Path, target: str | Path) -> Path:
    """Online backup through the SQLite backup API (WAL-safe).

    Never copy only the ``.db`` file of a live WAL database: committed pages
    may still live in ``.db-wal``.
    """
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError(f"Refusing to overwrite backup: {target}")
    own = not isinstance(source, sqlite3.Connection)
    src = connect(source) if own else source
    try:
        dst = sqlite3.connect(str(target))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        if own:
            src.close()
    return target


def health_check(conn: sqlite3.Connection) -> dict:
    """integrity_check must be 'ok' and foreign_key_check must be empty."""
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    fk_violations = [tuple(r) for r in conn.execute("PRAGMA foreign_key_check").fetchall()]
    return {
        "integrity_check": integrity,
        "foreign_key_violations": fk_violations,
        "journal_mode": conn.execute("PRAGMA journal_mode").fetchone()[0],
        "ok": integrity == "ok" and not fk_violations,
    }
