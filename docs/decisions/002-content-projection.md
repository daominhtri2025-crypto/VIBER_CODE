# ADR-002 — Thực thi phân quyền nội dung public/private
Status: accepted (06/10/2026, TASK-002) — triển khai đúng phương án A; P-2, P-4, P-5 pass với client thật.

## Bối cảnh
Metadata bài học/bài tập là public, còn nội dung (body, đề, gợi ý, lời giải) chỉ dành cho người đủ điều kiện. RLS của PostgreSQL lọc theo **hàng**, không theo **cột**: nếu anon có SELECT trên `lessons` chứa `body_md`, body có thể bị đọc trực tiếp qua Data API.

## Các lựa chọn đã xét
| Lựa chọn | Ưu | Nhược |
|---|---|---|
| A. Tách bảng `lesson_contents`, `exercise_contents`, `exercise_solutions`, mỗi bảng có RLS riêng | Thực thi hoàn toàn bằng RLS; không cần hàm definer; dễ kiểm thử từng bảng | Thêm join; ghi nội dung cần 2 bảng (transaction) |
| B. Column privileges (`revoke select (body_md)`) + RPC | Giữ một bảng | Dễ sai khi thêm cột; `select *` lỗi; khó bảo trì với Supabase client |
| C. View `security_invoker` chỉ lộ metadata | Gọn cho truy vấn public | View invoker vẫn cần quyền trên bảng gốc → bảng gốc vẫn lộ nếu không kết hợp B |

## Quyết định dự kiến
Chọn **A**. Các bảng metadata (`lessons`, `exercises`) chỉ chứa trường an toàn để public. Ghi nội dung admin trong một server action dùng transaction/RPC.

## Hệ quả
- DATA_MODEL và ACCESS_CONTROL đã cập nhật theo A.
- Ca kiểm thử P-2, P-4, P-5 trong ACCESS_CONTROL phải chạy với client anon/authenticated thật.
- Nếu task 002 phát hiện cản trở kỹ thuật, cập nhật ADR này trước khi đổi hướng.
