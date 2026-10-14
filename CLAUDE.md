# CLAUDE.md — Trợ lý AI học Toán THCS

Đọc trước khi viết mã:

1. `docs/PROJECT_HANDOFF.md` — nguồn chuẩn (Handoff v1.0). Nếu mâu thuẫn với prompt ngắn, Handoff thắng.
2. `docs/PHASE1_REPORT.md`, `PHASE2_REPORT.md`, `PHASE3_REPORT.md` — trạng thái, quyết định (D*, Q*, E*, F*) và phần còn thiếu.
3. `database/math_tutor_db/schema.sql` (baseline v1, **không sửa**) và `database/migrations/` (v2+).

## Quy tắc bất biến

- Thứ tự giai đoạn: 1 Database → 2 MathChecker/State machine → 3 API + AI + nghiên cứu → 4 UI. Chỉ sang giai đoạn kế khi checklist nghiệm thu đạt.
- Không sửa `schema.sql` hay migration đã áp dụng (runner kiểm tra checksum). Thay đổi schema = file `database/migrations/NNNN_name.sql` mới + test bảo toàn dữ liệu.
- Mọi kết nối qua `app.infrastructure.sqlite.connection.connect`; mọi ghi qua `transaction()` (BEGIN IMMEDIATE, ngắn). Không gọi mạng/AI trong transaction.
- Danh tính lấy từ token → `users.auth_subject`; không nhận actor_id, math_status, điểm, phương trình nền từ client.
- AI không cho đáp án; không chat/gợi ý/đúng-sai trong mode `independent` và assessment.
- Học sinh không bao giờ nhận `teacher_solution`/`hints` nội bộ.
- Không thực thi biểu thức từ input; không nối chuỗi SQL từ input (chỉ tham số `?`).
- Tests không cần API key; không làm yếu test để báo đạt.
- MathChecker là nơi DUY NHẤT quyết định đúng/sai; không dùng `eval`/`sympify` trên input học sinh (SymPy chỉ là oracle trong test).
- AI (Claude, KHÔNG dùng Gemini API: điều khoản cấm ứng dụng cho người <18 tuổi) chỉ diễn đạt; mọi đầu ra qua `check_output` + fallback; không gửi PII/văn bản tự do; không gọi AI trong independent/assessment.
- Không `ADD COLUMN` vào bảng v1 mà gói cũ INSERT theo vị trí (assessments, item_responses…): dùng bảng 1:1.
- Nội dung trong `content/` chỉ nạp qua `ContentStore` (kiểm checksum); sửa nội dung = file/version mới + cập nhật MANIFEST.

## Lệnh

```bash
cd api
pip install -r requirements-dev.txt
python -m pytest                                  # toàn bộ test (gồm 18 test baseline chạy trên DB v2)
python -m app.infrastructure.sqlite.cli init --db data/app.db --demo
python -m app.infrastructure.sqlite.cli migrate --db data/app.db
python -m app.infrastructure.sqlite.cli check --db data/app.db
```

Python ≥ 3.11 (dự án chốt 3.12), SQLite ≥ 3.38.
