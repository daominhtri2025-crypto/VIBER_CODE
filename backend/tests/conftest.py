import os

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

# Phải đặt biến môi trường trước khi import app
os.environ["DATABASE_URL"] = "sqlite:///./test_scam_shield.db"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only"
os.environ["FERNET_KEY"] = Fernet.generate_key().decode()

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def admin_user():
    with SessionLocal() as db:
        user = User(username="admin_test", password_hash=hash_password("matkhau-manh-123"), role="admin")
        db.add(user)
        db.commit()
    return {"username": "admin_test", "password": "matkhau-manh-123"}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
