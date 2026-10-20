# Kiến trúc và bàn giao — Sơn Trà Số

| Thông tin | Nội dung |
|---|---|
| Tài liệu | Hiện trạng repo, kiến trúc tổng thể và việc cần bàn giao |
| Phiên bản | 0.1 (bản nháp) |
| Ngày | 20/10/2026 |
| Nhánh | `Son_tra_so` |
| Tham chiếu | `SRS_Son_Tra_So.md` v1.1; `DAC_TA_Son_Tra_So_fullstack.md` v0.1; `CLAUDE.md` |
| Người phụ trách | [Cần bổ sung] |

**Quy ước:** `[Đã xác minh]` là kết quả kiểm tra trực tiếp trên repo. `[Chưa xác minh]` là thông tin lấy từ tài liệu, chưa có mã để đối chiếu.

---

## 1. Tóm tắt hiện trạng

**[Đã xác minh]** Nhánh `Son_tra_so` hiện chỉ có ba tệp:

| Tệp | Nguồn | Ghi chú |
|---|---|---|
| `README.md` | Commit gốc `5f82285` ("Initial commit") | Nội dung một dòng: `# VIBER_CODE` |
| `CLAUDE.md` | Commit `5837b51` | Quy tắc làm việc, bản đã áp dụng cho dự án |
| `SRS_Son_Tra_So.md` | Commit `5837b51` | SRS v1.1, bản nháp chờ phê duyệt |

Sau đó thêm hai tài liệu nháp: `DAC_TA_Son_Tra_So_fullstack.md` và `docs/KIEN_TRUC_VA_BAN_GIAO.md` (tệp này).

**Kết luận:** mã nguồn của Sơn Trà Số (phiên bản v4 được SRS tham chiếu) **không có trên nhánh này**. Các tệp dưới đây không tồn tại trong repo.

---

## 2. Đối chiếu tham chiếu trong SRS với repo

Đối chiếu SRS mục 9.1 và mục 1.4 với nội dung thực tế của nhánh.

| Tham chiếu trong SRS | Vị trí dự kiến | Trạng thái trên `Son_tra_so` |
|---|---|---|
| `public/online.js` | Giao diện học viên | Không có |
| `route.ts` (`/api/progress`, `/api/assessment`, `/api/dashboard`, `/api/video-link`) | Bản Sites | Không có |
| `schema.ts` | Bản Sites | Không có |
| `server-local/server.mjs` | Máy chủ cục bộ | Không có |
| `server-local/narration.mjs` | Máy chủ cục bộ | Không có |
| `server-local/README.md` | Hướng dẫn máy chủ cục bộ | Không có |
| `tests/client-progress.test.mjs`, `api.test.mjs`, `local-server.test.mjs`, `narration.test.mjs` | Kiểm thử | Không có |
| `DAC_TA_Son_Tra_So_fullstack.md` | Đặc tả kỹ thuật | Đã có bản nháp v0.1 (mới lập, chưa phải bản gốc v4) |
| `docs/KIEN_TRUC_VA_BAN_GIAO.md` | Hiện trạng và bàn giao | Tệp này (mới lập) |
| `SHA256SUMS.txt` | Kiểm tra toàn vẹn tệp phát hành | Không có |
| `videos/` | Thư mục video máy chủ cục bộ | Không có (thư mục runtime, có thể không commit) |

**Hệ quả với SRS mục 9.1 (ma trận truy vết):**
- Các cột "Mã nguồn" và "Kiểm thử" của mọi dòng đều không kiểm chứng được trên repo này.
- Cột "Minh chứng" ghi "Ghi trong hồ sơ", nên không xác nhận được thực tế.
- Hai dòng FR-KEY-02, FR-KEY-03 và FR-CNT-11, FR-CNT-12 ghi "Chưa triển khai" là phù hợp với repo.

---

## 3. Đánh giá trạng thái yêu cầu

Trạng thái dưới đây dựa trên việc **không có mã trên repo**. Nếu mã v4 tồn tại ở nơi khác, cần cập nhật bảng.

| Nhóm yêu cầu | Trạng thái trên repo | Ghi chú |
|---|---|---|
| FR-LRN, FR-OBS, FR-DSH, FR-ADM | Không kiểm chứng được | SRS ghi có mã và kiểm thử, nhưng không có trên repo |
| FR-CNT-01 đến 09 | Không kiểm chứng được | Tương tự |
| FR-CNT-10 đến 17 (âm thanh) | Chưa triển khai | Quyết định mới, chưa viết mã |
| FR-KEY-01 đến 09 (khóa Gemini) | Chưa triển khai | Có thể bị loại theo D-02 |
| Tailwind (D-01) | Chưa triển khai | Chưa có tệp CSS tĩnh |
| Ghi âm và chuyển WebM sang MP3 (D-03) | Chưa triển khai | Chưa chọn phương án, xem DAC_TA mục 6.4 |

---

## 4. Việc cần bàn giao để tiếp tục

Để tiếp tục triển khai (kể cả song song theo D-04), cần một trong các phương án sau:

| Phương án | Mô tả | Ưu điểm | Hạn chế |
|---|---|---|---|
| A | Đẩy mã v4 lên nhánh `Son_tra_so` (commit có lịch sử) | Đối chiếu được ngay, có lịch sử thay đổi | Cần quyền ghi và xác nhận phiên bản đúng |
| B | Cung cấp bản đóng gói (zip hoặc git bundle) có `server-local/`, `public/`, `tests/`, `docs/` | Không cần đẩy trực tiếp | Không có lịch sử, phải kiểm tra thủ công |
| C | Xác nhận mã v4 nằm ở repo khác | Tránh trộn mã | Phải đổi nhánh hoặc repo làm việc |

**Việc cần làm sau khi có mã** (theo CLAUDE.md mục 1.1):
1. Đọc mã v4 và các tệp liên quan.
2. Cập nhật `DAC_TA` mục 5.2 bằng đường dẫn và tên tham số thật.
3. Cập nhật `KIEN_TRUC` mục 2 và 3 bằng hiện trạng thật.
4. Chạy `npm test` để lấy baseline. Ghi kết quả vào tài liệu này.
5. Cập nhật ma trận truy vết SRS mục 9.1.

---

## 5. Kiến trúc tổng thể (tóm tắt)

Chi tiết xem `DAC_TA_Son_Tra_So_fullstack.md` mục 2.

```
                    ┌──────────────── Bản Sites ────────────────┐
Học viên / TNV ──▶  │ Cloudflare Workers → D1 (SQLite) + R2     │
                    └───────────────────────────────────────────┘
                    ┌──────────── Máy chủ cục bộ ───────────────┐
Quản trị viên  ──▶  │ 127.0.0.1 → Node.js 22.13+ → SQLite       │
                    │            → thư mục videos/, audio/       │
                    └───────────────────────────────────────────┘
Phần lõi nghiệp vụ dùng chung (shared/) được cả hai bản import.
```

---

## 6. Quyết định đang chờ

Các quyết định này chặn việc viết mã. Chi tiết trong `DAC_TA` mục 1 và mục 11.

| Mã | Vấn đề | Ảnh hưởng |
|---|---|---|
| D-02 | Bỏ hẳn TTS hay chỉ không dùng để phát âm? | FR-KEY, FR-CNT-07 đến 09, UC-06 |
| D-03 | Chuyển WebM sang MP3 bằng WASM (Sites) và ffmpeg (cục bộ)? | FR-CNT-13, 14; phụ thuộc mới |
| SRS 9.2 câu 9–10 | Quy tắc phát khi nguồn `none` hoặc có tệp tải lên | FR-CNT-15 |
| Append-only | Thay tệp âm thanh có vi phạm CLAUDE.md mục 4.4 không? | FR-CNT-16, UC-07 |
| Phê duyệt | Người phê duyệt SRS và đặc tả | Mọi phase |

---

## 7. Rủi ro hiện trạng

| Rủi ro | Mức | Biện pháp |
|---|---|---|
| Không có mã v4 trên repo, nên không kiểm chứng được phần lớn yêu cầu đã "hoàn thành" | Cao | Mục 4 |
| SRS mâu thuẫn với CLAUDE.md ở một số điểm (mẫu tên migration; ffmpeg) | Trung bình | Sửa khi phê duyệt |
| Hai nhánh khác (`main` chỉ có README, `math-tutor` thuộc dự án khác) có thể gây nhầm lẫn khi làm việc | Thấp | Ghi rõ nhánh làm việc trong mọi báo cáo |
| Thiếu `SHA256SUMS.txt` nên không kiểm tra được tệp phát hành | Trung bình | Tạo khi có mã v4 |

---

## 8. Lịch sử thay đổi tài liệu

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| 0.1 | 20/10/2026 | Lập hiện trạng từ repo `Son_tra_so` (commit `5f82285` và `5837b51`). Đối chiếu SRS mục 9.1 |
