# TASK-004: Seed demo, DB types và provision admin
Status: done (07/10/2026)

## Mục tiêu
Có dữ liệu demo nhất quán để phát triển UI và hướng dẫn tạo admin.

## Phụ thuộc
003

## Tài liệu liên quan
PRODUCT_BRIEF (nội dung khởi đầu), DATA_MODEL

## Phạm vi
- `supabase/seed.sql`: 2 khóa (Scratch, Python) × 2 chương × 2 bài + 2 bài tập/khóa; có bài preview, 1 khóa draft, 1 bài draft trong khóa published; mọi tiêu đề gắn nhãn "[Demo]".
- Tài khoản demo local (student A, student B, admin) với mật khẩu chỉ dùng local, ghi trong tài liệu dev, không dùng ở môi trường khác.
- ~~Sinh TypeScript DB types~~ — đã làm ở TASK-002 (`npm run db:types`).
- Tài liệu `docs/operations/ADMIN_PROVISIONING.md`: câu lệnh SQL nâng/hạ quyền admin.

## Ngoài phạm vi
- UI; dữ liệu thật.

## Tiêu chí nghiệm thu
1. `supabase db reset` tạo đủ quan hệ seed, không lỗi.
2. Seed bao phủ các trường hợp: preview, draft course, draft lesson trong khóa published, bài tập có/không gắn bài học, có/không hint2.
3. Types sinh ra khớp schema, `npm run typecheck` pass.
4. Không có danh tính/mật khẩu thật.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Lệnh | `supabase db reset` rồi truy vấn đếm theo bảng | Số lượng đúng mô tả |
| Lệnh | `npm run typecheck` | Pass |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Kết quả
- `supabase/seed.sql` (nạp tự động khi `db:reset`), `scripts/seed-demo-users.mjs` (`npm run db:seed-users`, chỉ chạy local), `npm run db:setup`.
- Tài liệu: `docs/operations/ADMIN_PROVISIONING.md`, `docs/operations/LOCAL_DEMO_ACCOUNTS.md`.
- Test: `tests/integration/seed.test.ts` (7 ca); toàn bộ integration 55/55 pass.
- Lệch so với phạm vi gốc: khóa Scratch có thêm 1 bài draft (5 bài) để phủ trường hợp "bài draft trong khóa published"; tài khoản demo tạo qua Admin API thay vì insert trực tiếp `auth.users` (tránh phụ thuộc cấu trúc nội bộ của GoTrue).

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
