"""Encrypted rolling backups + restore with erasure replay (decision 14/10/2026).

* ``create_encrypted_backup``: SQLite online backup API → Fernet (AES-128-CBC +
  HMAC-SHA256) encrypted file; the plaintext temp copy is overwritten and removed.
* ``prune_backups``: deletes encrypted backups older than the retention window
  (default 30 days). Deletion of personal data is therefore complete within
  30 days for backups, and immediate for the live database.
* ``restore_backup``: decrypts into a NEW file, then replays every erasure
  recorded in the external ledger, so a restore can never resurrect erased data.

Schedule ``backup`` + ``prune`` daily (Windows Task Scheduler / cron). Keep
``BACKUP_KEY`` outside the backup directory.
"""
from __future__ import annotations

import os
import re
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from app.infrastructure.sqlite.connection import backup as sqlite_backup
from app.infrastructure.sqlite.connection import connect, health_check
from app.infrastructure.sqlite.repositories.erasure import read_ledger, replay_erasures

_NAME_RE = re.compile(r"^(?P<stem>.+)_(?P<stamp>\d{8}T\d{6}Z)\.db\.enc$")


class BackupError(RuntimeError):
    pass


def _fernet(key: str | None) -> Fernet:
    if not key:
        raise BackupError("BACKUP_KEY is required (generate with Fernet.generate_key())")
    return Fernet(key.encode() if isinstance(key, str) else key)


def _shred(path: Path) -> None:
    if path.exists():
        size = path.stat().st_size
        with path.open("r+b") as fh:
            fh.write(b"\0" * size)
            fh.flush()
            os.fsync(fh.fileno())
        path.unlink()


def create_encrypted_backup(db_path: Path, backup_dir: Path, key: str | None,
                            now: datetime | None = None) -> Path:
    f = _fernet(key)
    now = now or datetime.now(timezone.utc)
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / f"{Path(db_path).stem}_{now.strftime('%Y%m%dT%H%M%SZ')}.db.enc"
    if target.exists():
        raise BackupError(f"Backup already exists: {target}")
    with tempfile.TemporaryDirectory() as tmp:
        plain = Path(tmp) / "snapshot.db"
        sqlite_backup(db_path, plain)
        try:
            target.write_bytes(f.encrypt(plain.read_bytes()))
        finally:
            _shred(plain)
    return target


def prune_backups(backup_dir: Path, retention_days: int, now: datetime | None = None) -> list[Path]:
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=retention_days)
    removed = []
    for p in sorted(backup_dir.glob("*.db.enc")):
        m = _NAME_RE.match(p.name)
        if not m:
            continue
        stamp = datetime.strptime(m.group("stamp"), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        if stamp < cutoff:
            p.unlink()
            removed.append(p)
    return removed


def restore_backup(encrypted: Path, target_db: Path, key: str | None, ledger_path: Path | None) -> dict:
    if target_db.exists():
        raise BackupError(f"Refusing to overwrite existing database: {target_db}")
    try:
        data = _fernet(key).decrypt(encrypted.read_bytes())
    except InvalidToken as exc:
        raise BackupError("Backup cannot be decrypted (wrong key or tampered file)") from exc
    target_db.parent.mkdir(parents=True, exist_ok=True)
    target_db.write_bytes(data)
    conn = connect(target_db)
    try:
        replayed = replay_erasures(conn, read_ledger(ledger_path)) if ledger_path else []
        report = health_check(conn)
    finally:
        conn.close()
    if not report["ok"]:
        raise BackupError(f"Restored database failed checks: {report}")
    return {"restored": str(target_db), "erasures_replayed": replayed, "health": report}
