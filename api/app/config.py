"""Runtime settings from environment variables (no secrets in code or ai_configs).

See ``api/.env.example`` for the full list. Tests build ``Settings`` directly.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    db_path: Path = Path("data/app.db")

    # --- auth
    jwt_secret: str = ""                      # REQUIRED in production (>= 32 chars)
    jwt_issuer: str = "math-tutor-api"
    access_ttl_seconds: int = 15 * 60
    refresh_ttl_seconds: int = 14 * 24 * 3600
    max_failed_logins: int = 5
    lockout_seconds: int = 15 * 60
    google_client_id: str | None = None       # None disables Google login
    google_allowed_domains: tuple[str, ...] = ()  # empty = any domain (decision 14/10/2026)

    # --- AI (Anthropic Claude, decision 14/10/2026)
    ai_enabled: bool = False
    ai_provider: str = "anthropic"            # "mock" = deterministic offline tutor for demos/E2E (never in production)
    anthropic_api_key: str | None = None
    ai_timeout_seconds: float = 8.0
    ai_quota_per_session: int = 30
    ai_quota_per_student_per_day: int = 100
    ai_daily_budget_usd: float = 5.0
    quota_timezone_offset_hours: int = 7      # "day" boundaries in Asia/Ho_Chi_Minh

    # --- operations
    backup_dir: Path = Path("backups")
    backup_retention_days: int = 30
    backup_key: str | None = None             # Fernet key (base64, 32 bytes) — REQUIRED for backups
    erasure_ledger_path: Path | None = None   # append-only JSONL outside the DB (replayed on restore)
    cors_origins: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_env(cls) -> "Settings":
        def b(name: str, default: bool) -> bool:
            v = _env(name)
            return default if v is None else v.lower() in ("1", "true", "yes", "on")

        def split(name: str) -> tuple[str, ...]:
            return tuple(x.strip().lower() for x in (_env(name, "") or "").split(",") if x.strip())

        ledger = _env("ERASURE_LEDGER_PATH")
        return cls(
            db_path=Path(_env("APP_DB_PATH", "data/app.db")),
            jwt_secret=_env("JWT_SECRET", "") or "",
            access_ttl_seconds=int(_env("ACCESS_TTL_SECONDS", "900")),
            refresh_ttl_seconds=int(_env("REFRESH_TTL_SECONDS", str(14 * 24 * 3600))),
            google_client_id=_env("GOOGLE_CLIENT_ID"),
            google_allowed_domains=split("GOOGLE_ALLOWED_DOMAINS"),
            ai_enabled=b("AI_ENABLED", False),
            ai_provider=(_env("AI_PROVIDER", "anthropic") or "anthropic").lower(),
            anthropic_api_key=_env("ANTHROPIC_API_KEY"),
            ai_timeout_seconds=float(_env("AI_TIMEOUT_SECONDS", "8")),
            ai_quota_per_session=int(_env("AI_QUOTA_PER_SESSION", "30")),
            ai_quota_per_student_per_day=int(_env("AI_QUOTA_PER_STUDENT_PER_DAY", "100")),
            ai_daily_budget_usd=float(_env("AI_DAILY_BUDGET_USD", "5")),
            backup_dir=Path(_env("BACKUP_DIR", "backups")),
            backup_retention_days=int(_env("BACKUP_RETENTION_DAYS", "30")),
            backup_key=_env("BACKUP_KEY"),
            erasure_ledger_path=Path(ledger) if ledger else None,
            cors_origins=split("CORS_ORIGINS"),
        )

    def validate_for_production(self) -> None:
        if len(self.jwt_secret) < 32:
            raise RuntimeError("JWT_SECRET must be at least 32 characters")
        if self.ai_provider not in ("anthropic", "mock"):
            raise RuntimeError("AI_PROVIDER must be anthropic|mock")
        if self.ai_enabled and self.ai_provider == "anthropic" and not self.anthropic_api_key:
            raise RuntimeError("AI_ENABLED requires ANTHROPIC_API_KEY")
