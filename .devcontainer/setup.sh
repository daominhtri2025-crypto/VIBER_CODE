#!/usr/bin/env bash
# One-time Codespace setup: demo-only .env, image build, demo data. Never use this .env for a real pilot.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/4] Chờ Docker sẵn sàng..."
for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
docker info >/dev/null

if [ ! -f .env ]; then
  echo "[2/4] Tạo .env cho bản demo (khóa ngẫu nhiên, AI giả lập)..."
  cp .env.docker.example .env
  jwt=$(head -c 48 /dev/urandom | base64 -w0 | tr '+/' '-_' | tr -d '=')
  fernet=$(head -c 32 /dev/urandom | base64 -w0 | tr '+/' '-_')   # 32 byte, base64 urlsafe = khóa Fernet hợp lệ
  sed -i \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|" \
    -e "s|^BACKUP_KEY=.*|BACKUP_KEY=${fernet}|" \
    -e "s|^AI_ENABLED=.*|AI_ENABLED=true|" \
    -e "s|^AI_PROVIDER=.*|AI_PROVIDER=mock|" \
    -e "s|^COOKIE_SECURE=.*|COOKIE_SECURE=false|" \
    .env
else
  echo "[2/4] Đã có .env — giữ nguyên."
fi

echo "[3/4] Build image (lần đầu khoảng 5–10 phút)..."
docker compose build

if [ ! -f .devcontainer/.seeded ]; then
  echo "[4/4] Nạp dữ liệu demo (5 tài khoản, mật khẩu Demo-2026!)..."
  docker compose run --rm api python -m scripts.seed_demo --db /data/app.db
  touch .devcontainer/.seeded
else
  echo "[4/4] Dữ liệu demo đã có — bỏ qua."
fi
