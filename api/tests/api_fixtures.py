"""Shared fixtures for API integration tests (no network, no API keys)."""
from __future__ import annotations

import itertools
import time
from dataclasses import dataclass, field

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.config import Settings
from app.infrastructure.ai.mock import MockTutorAI
from app.infrastructure.auth import GoogleIdTokenVerifier, hash_password
from app.infrastructure.sqlite.connection import connect
from app.infrastructure.sqlite.migrations import initialize
from app.infrastructure.sqlite.repositories.research import AIConfigRepository

PASSWORD = "Mat-khau-demo-2026"
SEED_ACCOUNTS = {  # user_id -> (username, email)
    "student-a": ("hs.a", "hs.a@example.edu.vn"),
    "student-b": ("hs.b", None),
    "teacher-demo": ("gv.demo", "gv.demo@example.edu.vn"),
    "researcher-demo": ("nc.demo", None),
    "admin-demo": ("qt.demo", None),
}
GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com"
_ids = itertools.count()


def rid(prefix: str = "r") -> str:
    return f"{prefix}-{next(_ids)}"


class _StaticKey:
    def __init__(self, public_key):
        self.key = public_key


class StaticResolver:
    def __init__(self, public_key):
        self._k = _StaticKey(public_key)

    def get_signing_key_from_jwt(self, token):
        return self._k


@dataclass
class Env:
    client: TestClient
    db_path: object
    tutor: MockTutorAI
    google_key: object
    settings: Settings
    tokens: dict = field(default_factory=dict)

    def headers(self, user_id: str) -> dict:
        if user_id not in self.tokens:
            username = SEED_ACCOUNTS[user_id][0]
            r = self.client.post("/api/v1/auth/login", json={"username": username, "password": PASSWORD})
            assert r.status_code == 200, r.text
            self.tokens[user_id] = r.json()["access_token"]
        return {"Authorization": f"Bearer {self.tokens[user_id]}"}

    def google_token(self, *, sub: str, email: str, verified: bool = True, aud: str = GOOGLE_CLIENT_ID,
                     iss: str = "https://accounts.google.com") -> str:
        now = int(time.time())
        return jwt.encode({"sub": sub, "email": email, "email_verified": verified, "aud": aud, "iss": iss,
                           "iat": now, "exp": now + 600}, self.google_key, algorithm="RS256")

    def conn(self):
        return connect(self.db_path)


def build_env(tmp_path, *, tutor: MockTutorAI | None = None, **settings_over) -> Env:
    db_path = initialize(tmp_path / "api.db", demo=True)
    c = connect(db_path)
    c.execute("BEGIN IMMEDIATE")
    for uid, (username, email) in SEED_ACCOUNTS.items():
        c.execute("INSERT INTO user_credentials(user_id, username, password_hash, must_change_password)"
                  " VALUES(?,?,?,0)", (uid, username, hash_password(PASSWORD)))
        if email:
            c.execute("UPDATE users SET email=? WHERE id=?", (email, uid))
    c.execute("COMMIT")
    cfg = AIConfigRepository(c).create(admin_id="admin-demo", provider="mock", model_name="mock-1",
                                       prompt_version="tutor-system-v1",
                                       parameters={"max_output_tokens": 300, "price_input_per_mtok": 0.10,
                                                   "price_output_per_mtok": 0.50})
    AIConfigRepository(c).activate(admin_id="admin-demo", ai_config_id=cfg["id"])
    c.close()
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    base = dict(db_path=db_path, jwt_secret="t" * 40, ai_enabled=True, google_client_id=GOOGLE_CLIENT_ID,
                backup_dir=tmp_path / "backups", backup_key=None, erasure_ledger_path=tmp_path / "ledger.jsonl")
    base.update(settings_over)
    settings = Settings(**base)
    tutor = tutor or MockTutorAI()
    google = GoogleIdTokenVerifier(GOOGLE_CLIENT_ID, allowed_domains=settings.google_allowed_domains,
                                   key_resolver=StaticResolver(key.public_key()))
    app = create_app(settings, tutor=tutor, google=google)
    return Env(TestClient(app), db_path, tutor, key, settings)
