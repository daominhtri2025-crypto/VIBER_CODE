# TASK-004: Seed demo, DB types và provision admin
Status: pending

## Mục tiêu
Có dữ liệu demo nhất quán để phát triển UI và hướng dẫn tạo admin.

## Phụ thuộc
003

## Tài liệu liên quan
PRODUCT_BRIEF (nội dung khởi đầu), DATA_MODEL

## Phạm vi
- `supabase/seed.sql`: 2 khóa (Scratch, Python) × 2 chương × 2 bài + 2 bài tập/khóa; có bài preview, 1 khóa draft, 1 bài draft trong khóa published; mọi tiêu đề gắn nhãn "[Demo]".
- Tài khoản demo local (student A, student B, admin) với mật khẩu chỉ dùng local, ghi trong tài liệu dev, không dùng ở môi trường khác.
- Sinh TypeScript DB types vào `src/types`; script cập nhật types.
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

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
