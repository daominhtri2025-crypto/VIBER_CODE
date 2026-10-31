from app.core.security import hash_password, verify_password


def test_password_hash_roundtrip():
    hashed = hash_password("mot-mat-khau")
    assert hashed != "mot-mat-khau"
    assert verify_password("mot-mat-khau", hashed)
    assert not verify_password("sai-mat-khau", hashed)


def test_health_endpoint(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_login_success_returns_token(client, admin_user):
    resp = client.post("/api/auth/login", json=admin_user)
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_wrong_password_is_rejected(client, admin_user):
    resp = client.post("/api/auth/login", json={**admin_user, "password": "sai"})
    assert resp.status_code == 401


def test_login_unknown_user_is_rejected(client):
    resp = client.post("/api/auth/login", json={"username": "ghost", "password": "x"})
    assert resp.status_code == 401


def test_login_writes_audit_log(client, admin_user):
    from sqlalchemy import select

    from app.core.database import SessionLocal
    from app.models import AuditLog

    client.post("/api/auth/login", json=admin_user)
    with SessionLocal() as db:
        entries = db.scalars(select(AuditLog).where(AuditLog.action == "login")).all()
        assert len(entries) == 1
        assert entries[0].ip_hash is not None
        assert entries[0].ip_hash != "testclient"  # IP phải được băm
