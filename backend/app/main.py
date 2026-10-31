from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import auth
from app.core.config import get_settings
from app.core.database import Base, engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Demo v1: tạo bảng tự động. Có thể thay bằng Alembic ở giai đoạn sau.
    from app.models import AuditLog, User  # noqa: F401  (đăng ký model)

    Base.metadata.create_all(bind=engine)
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.include_router(auth.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
