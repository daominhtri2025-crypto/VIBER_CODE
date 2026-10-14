# Triển khai thí điểm bằng Docker

## 1. Chuẩn bị (một lần)

```bash
git clone math-tutor-history.bundle math-tutor && cd math-tutor
cp .env.docker.example .env
```

Sửa các giá trị trong `.env`:

| Biến | Cách đặt |
|---|---|
| `JWT_SECRET` | Chuỗi ngẫu nhiên, tối thiểu 32 ký tự |
| `BACKUP_KEY` | Tạo bằng lệnh `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`. **Lưu một bản ngoài máy chủ.** Mất khóa này thì mất toàn bộ backup. |
| `AI_ENABLED`, `ANTHROPIC_API_KEY` | Bật AI chỉ khi đã có API key gói trả phí. Khi để `false`, hệ thống dùng phản hồi mẫu đã được giáo viên duyệt. |
| `COOKIE_SECURE` | Đặt `true` khi chạy sau HTTPS. Thí điểm thật **bắt buộc** chạy HTTPS. |

## 2. Chạy

```bash
docker compose up -d --build
docker compose exec api python -m app.infrastructure.sqlite.cli create-admin --db /data/app.db --username qt.admin --name "Quản trị"
```

Mở `http://<máy-chủ>:3000`, đăng nhập bằng tài khoản admin vừa tạo, rồi:
1. Tạo tài khoản giáo viên và người nghiên cứu.
2. Nếu dùng AI: vào mục **Quản trị → Trợ lý AI**, tạo cấu hình `claude-haiku-5-5`, rồi bấm **Dùng cấu hình này**.

**Bản demo có sẵn dữ liệu mẫu** (5 tài khoản, AI giả lập), chạy ngoài Docker:

```bash
cd api
python -m scripts.seed_demo --db data/demo.db --ai-provider mock
```

## 3. Kiến trúc mạng

```
Trình duyệt ──HTTPS──> reverse proxy (tùy chọn) ──> web :3000 (Next.js, giữ token trong cookie httpOnly)
                                                       └──> api :8000 (chỉ có trong mạng nội bộ của compose)
```

- Chỉ cổng web được mở ra ngoài.
- Nên đặt một reverse proxy có HTTPS và **giới hạn tần suất truy cập** cho `/bff/auth/*` (ví dụ Caddy hoặc Nginx). API hiện mới khóa theo từng tài khoản, chưa giới hạn theo IP.

## 4. Dữ liệu và backup

Docker lưu dữ liệu trong 3 volume riêng:

| Volume | Nội dung |
|---|---|
| `db` | File database `app.db` |
| `backups` | Backup đã mã hóa, chỉ giữ 30 ngày gần nhất |
| `ops` | Sổ ghi các lệnh xóa dữ liệu (`erasure_ledger.jsonl`) |

- Dịch vụ `backup` tự chạy backup và dọn bản cũ mỗi 24 giờ.
- Mỗi lần API khởi động, migration chạy tự động và **sao lưu trước khi nâng cấp**.
- **Khôi phục**, có tự chạy lại các lệnh xóa dữ liệu đã thực hiện:
  ```bash
  docker compose exec api python -m app.infrastructure.sqlite.cli restore --from /backups/app_XXXX.db.enc --to /data/restored.db
  ```
  Sau đó dừng API, đổi tên `restored.db` thành `app.db`, rồi khởi động lại.

## 5. Kiểm thử trước thí điểm

| Lệnh | Kiểm tra gì |
|---|---|
| `cd api && python -m pytest` | Backend, 892 test |
| `cd web && npm test` | Phần xem trước công thức và bàn phím ảo |
| `scripts/e2e.sh` | 7 kịch bản đầu-cuối, chạy trên database demo mới (cần Chromium cho Playwright) |
