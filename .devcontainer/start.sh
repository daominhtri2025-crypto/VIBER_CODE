#!/usr/bin/env bash
# Start (or restart) the demo stack each time the Codespace starts.
set -euo pipefail
cd "$(dirname "$0")/.."
for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
docker compose up -d
for _ in $(seq 1 60); do
  curl -fsS -o /dev/null http://localhost:3000/login && break
  sleep 2
done
docker compose ps
cat <<'EOF'

==========================================================
 Toán từng bước đã chạy ở cổng 3000 (tab PORTS → mở địa chỉ).
 Tài khoản demo (mật khẩu chung: Demo-2026!):
   hs.a, hs.b  — học sinh      gv.demo — giáo viên
   nc.demo     — nghiên cứu    qt.demo — quản trị
 AI đang ở chế độ giả lập (mock), không gọi Internet.
==========================================================
EOF
