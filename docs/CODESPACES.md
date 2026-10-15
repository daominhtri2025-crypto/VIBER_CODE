# Chạy thử trên GitHub Codespaces (không cài gì lên máy)

Bản chạy thử dùng **đúng các Docker image sẽ cài thật** (`docker compose`). Dữ liệu là bản demo, AI ở chế độ giả lập (`AI_PROVIDER=mock`), không cần khóa API.

## 1. Mở Codespace

1. Vào `https://github.com/daominhtri2025-crypto/VIBER_CODE` và chọn **nhánh `math-tutor`** ở ô chọn nhánh.
2. Bấm **Code → Codespaces → ⋯ → New with options…**.
3. Giữ **Branch: `math-tutor`**. Ở **Machine type**, chọn **4-core**.
4. Bấm **Create codespace**.

Lần đầu mất khoảng **10–15 phút**. Thời gian chủ yếu dùng để build image. Theo dõi tiến trình trong tab **Terminal** (dòng `postCreateCommand`), gồm 4 bước:

| Bước | Việc |
|---|---|
| 1 | Chờ Docker sẵn sàng |
| 2 | Tạo `.env`: khóa ngẫu nhiên, AI giả lập |
| 3 | `docker compose build` |
| 4 | Nạp dữ liệu demo |

Sau đó stack tự khởi động. Terminal in ra khung **"Toán từng bước đã chạy ở cổng 3000"**.

## 2. Mở ứng dụng

Mở tab **PORTS**, tìm dòng **Toán từng bước (web) — 3000**, rồi bấm biểu tượng quả địa cầu (*Open in Browser*). Địa chỉ có dạng `https://<tên>-3000.app.github.dev`.

Tài khoản demo dùng chung mật khẩu **`Demo-2026!`**:

| Tài khoản | Vai trò |
|---|---|
| `hs.a`, `hs.b` | Học sinh |
| `gv.demo` | Giáo viên kiêm nghiên cứu viên |
| `nc.demo` | Nghiên cứu viên |
| `qt.demo` | Quản trị viên |

Kịch bản thử gợi ý theo mục 4–7 của `docs/Huong_dan_cai_dat_va_su_dung.docx`:

1. `hs.b` làm bài `2x + 5 = 17`. Cố ý ghi một bước sai, xin gợi ý, rồi làm tiếp đến hết bước 6.
2. `gv.demo` xem từng bước của `hs.b`, soạn rồi duyệt một bài mới, sau đó giao bài.
3. `nc.demo` chấm bài kiểm tra và xuất CSV. `qt.demo` duyệt yêu cầu xóa dữ liệu.

## 3. Lệnh hữu ích (trong Terminal của Codespace)

```bash
docker compose ps                     # trạng thái 3 dịch vụ
docker compose logs -f api            # nhật ký API
docker compose exec api python -m app.infrastructure.sqlite.cli check --db /data/app.db
docker compose exec api python -m app.infrastructure.sqlite.cli backup-encrypted --db /data/app.db
```

Muốn thử lại từ đầu với dữ liệu sạch:

```bash
docker compose down -v && rm -f .devcontainer/.seeded && bash .devcontainer/setup.sh && bash .devcontainer/start.sh
```

## 4. Lưu ý

- **Chi phí.** Codespaces tính theo giờ chạy. Tài khoản cá nhân có hạn mức miễn phí hằng tháng. Khi thử xong, vào `https://github.com/codespaces` và **Stop** hoặc **Delete** codespace.
- **Phạm vi truy cập.** Cổng 3000 mặc định ở chế độ **Private**: chỉ người đăng nhập GitHub của anh mở được. Nếu đổi sang Public, bất kỳ ai có đường link đều vào được bản demo.
- **Không dùng cho dữ liệu thật.** File `.env` trong Codespace chỉ dùng để thử. Repo đang public, vì vậy không nhập dữ liệu học sinh thật vào bản demo.
- **Phần chưa kiểm được.** Codespaces kiểm được ứng dụng và Docker image. Nó **không** kiểm được các bước riêng của Windows như WSL 2, Docker Desktop, tường lửa và PowerShell trong mục 2 của tài liệu hướng dẫn.
