"""Authentication primitives: Argon2id passwords, HS256 access JWTs, opaque
rotating refresh tokens, and Google ID-token verification.

Security notes
--------------
* Access tokens carry only ``sub`` (users.id); roles/status are re-read from the
  database on every request so revocation is immediate.
* Refresh tokens are 256-bit random strings; only their SHA-256 is stored.
* Google ID tokens are verified against Google's JWKS (signature, ``aud``,
  ``iss``, ``exp``, ``email_verified``) and an optional domain allowlist.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.domain.errors import DomainError

_hasher = PasswordHasher()  # Argon2id with library defaults (RFC 9106 low-memory profile)
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing-equalisation")

GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"


class AuthError(DomainError):
    """401: missing/invalid/expired credentials. Message is deliberately generic."""
    code = "UNAUTHENTICATED"


# ---------------------------------------------------------------- passwords
MIN_PASSWORD_LEN = 8


def hash_password(password: str) -> str:
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LEN or len(password) > 256:
        raise ValueError(f"Password must be {MIN_PASSWORD_LEN}..256 characters")
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Constant-ish time: always runs one Argon2 verification."""
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# ------------------------------------------------------------------ tokens
def issue_access_token(user_id: str, *, secret: str, issuer: str, ttl_seconds: int,
                       now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "iss": issuer, "typ": "access", "jti": uuid.uuid4().hex,
                       "iat": int(now.timestamp()), "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp())},
                      secret, algorithm="HS256")


def decode_access_token(token: str, *, secret: str, issuer: str) -> str:
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], issuer=issuer,
                            options={"require": ["sub", "exp", "iat", "iss"]})
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid or expired token") from exc
    if claims.get("typ") != "access":
        raise AuthError("Invalid token type")
    return str(claims["sub"])


def new_refresh_token() -> tuple[str, str]:
    """(plaintext for the client, sha256 hex for the database)."""
    token = secrets.token_urlsafe(32)
    return token, hash_refresh_token(token)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ------------------------------------------------------------ Google login
@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str
    hosted_domain: str | None


class SigningKeyResolver(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> Any: ...


class GoogleIdTokenVerifier:
    def __init__(self, client_id: str, *, allowed_domains: tuple[str, ...] = (),
                 key_resolver: SigningKeyResolver | None = None):
        self.client_id = client_id
        self.allowed_domains = tuple(d.lower() for d in allowed_domains)
        self.keys = key_resolver or jwt.PyJWKClient(GOOGLE_JWKS_URL, cache_keys=True)

    def verify(self, id_token: str) -> GoogleIdentity:
        try:
            key = self.keys.get_signing_key_from_jwt(id_token)
            claims = jwt.decode(id_token, key.key, algorithms=["RS256"], audience=self.client_id,
                                options={"require": ["sub", "aud", "iss", "exp", "iat"]})
        except (jwt.PyJWTError, KeyError, ValueError) as exc:
            raise AuthError("Invalid Google token") from exc
        if claims.get("iss") not in GOOGLE_ISSUERS:
            raise AuthError("Invalid Google token issuer")
        email = str(claims.get("email", "")).lower()
        if not email or claims.get("email_verified") is not True:
            raise AuthError("Google email is not verified")
        domain = email.rsplit("@", 1)[-1]
        if self.allowed_domains and domain not in self.allowed_domains:
            raise AuthError("Email domain is not allowed")
        return GoogleIdentity(subject=str(claims["sub"]), email=email, hosted_domain=claims.get("hd"))
