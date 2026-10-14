"""Create a DEMO database with login accounts for the 5 synthetic seed users.

    python -m scripts.seed_demo --db data/demo.db [--password DEMO_PASSWORD] [--ai-provider mock|anthropic]

Synthetic data only (handoff §1.4: seed is not research data). Refuses to overwrite.
Accounts: hs.a, hs.b (student), gv.demo (teacher+researcher), nc.demo (researcher), qt.demo (admin).
"""
from __future__ import annotations

import argparse

from app.infrastructure.auth import hash_password
from app.infrastructure.sqlite.connection import connect, transaction
from app.infrastructure.sqlite.migrations import initialize
from app.infrastructure.sqlite.repositories.research import AIConfigRepository

ACCOUNTS = {"student-a": "hs.a", "student-b": "hs.b", "teacher-demo": "gv.demo",
            "researcher-demo": "nc.demo", "admin-demo": "qt.demo"}
HAIKU = {"max_output_tokens": 300, "price_input_per_mtok": 0.10, "price_output_per_mtok": 0.50}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--password", default="Demo-2026!")
    ap.add_argument("--ai-provider", choices=("mock", "anthropic"), default="mock")
    a = ap.parse_args()
    path = initialize(a.db, demo=True)
    conn = connect(path)
    try:
        with transaction(conn):
            for uid, username in ACCOUNTS.items():
                conn.execute("INSERT INTO user_credentials(user_id, username, password_hash, must_change_password)"
                             " VALUES(?,?,?,0)", (uid, username, hash_password(a.password)))
        repo = AIConfigRepository(conn)
        model = "mock-1" if a.ai_provider == "mock" else "claude-haiku-5-5"
        cfg = repo.create(admin_id="admin-demo", provider=a.ai_provider, model_name=model,
                          prompt_version="tutor-system-v1", parameters=HAIKU)
        repo.activate(admin_id="admin-demo", ai_config_id=cfg["id"])
    finally:
        conn.close()
    print(f"Demo DB ready: {path} (password for all demo accounts: {a.password})")


if __name__ == "__main__":
    main()
