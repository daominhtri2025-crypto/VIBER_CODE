"""Database administration CLI.

    python -m app.infrastructure.sqlite.cli init    --db data/app.db [--demo]
    python -m app.infrastructure.sqlite.cli migrate --db data/app.db [--backup-dir DIR]
    python -m app.infrastructure.sqlite.cli status  --db data/app.db
    python -m app.infrastructure.sqlite.cli check   --db data/app.db
    python -m app.infrastructure.sqlite.cli backup  --db data/app.db --out backups/x.db

Run from the ``api/`` directory. ``init`` refuses to overwrite a file;
``migrate`` always backs up first.
"""
from __future__ import annotations

import argparse
import json
import sys

from app.infrastructure.sqlite import migrations as mig
from app.infrastructure.sqlite.connection import backup, connect, health_check


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="dbcli", description="Math Tutor SQLite administration")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("init", "migrate", "status", "check", "backup"):
        p = sub.add_parser(name)
        p.add_argument("--db", required=True)
        if name == "init":
            p.add_argument("--demo", action="store_true")
        if name == "migrate":
            p.add_argument("--backup-dir")
            p.add_argument("--target", type=int)
        if name == "backup":
            p.add_argument("--out", required=True)
    a = ap.parse_args(argv)

    if a.cmd == "init":
        result = {"created": str(mig.initialize(a.db, demo=a.demo))}
    elif a.cmd == "migrate":
        result = mig.migrate(a.db, backup_dir=a.backup_dir, target=a.target)
    elif a.cmd == "backup":
        result = {"backup": str(backup(a.db, a.out))}
    else:
        conn = connect(a.db)
        try:
            result = mig.status(conn) if a.cmd == "status" else health_check(conn)
        finally:
            conn.close()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok", True) else 1


if __name__ == "__main__":
    sys.exit(main())
