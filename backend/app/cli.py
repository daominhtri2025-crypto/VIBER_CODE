"""Tạo tài khoản Admin đầu tiên: python -m app.cli create-admin <username>

Mật khẩu được nhập qua prompt ẩn, không ghi vào log hay tham số dòng lệnh.
"""

import getpass
import sys

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import User


def create_admin(username: str, password: str) -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == username)) is not None:
            raise SystemExit(f"Tài khoản '{username}' đã tồn tại.")
        db.add(User(username=username, password_hash=hash_password(password), role="admin"))
        db.commit()
    print(f"Đã tạo Admin '{username}'.")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "create-admin":
        raise SystemExit("Cách dùng: python -m app.cli create-admin <username>")
    pwd = getpass.getpass("Mật khẩu Admin (tối thiểu 10 ký tự): ")
    if len(pwd) < 10:
        raise SystemExit("Mật khẩu quá ngắn.")
    create_admin(sys.argv[2], pwd)
