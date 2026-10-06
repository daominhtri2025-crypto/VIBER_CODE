# ADR-003 — Danh tính, vai trò và provision admin
Status: proposed (06/10/2026). Xác nhận ở task 003.

## Bối cảnh
Cần phân biệt student/admin mà không để client tự nâng quyền. `user_metadata` trong Supabase Auth do client gửi lúc đăng ký, nên không đáng tin cho phân quyền.

## Quyết định dự kiến
1. Role lưu ở bảng `user_roles` (PK `user_id`), tách khỏi `profiles`; người dùng chỉ được SELECT dòng của mình.
2. Trigger sau khi tạo `auth.users` (hàm `security definer`, `search_path` cố định) chèn `profiles(display_name)` và `user_roles(role='student')`. Trigger chỉ lấy `display_name` từ metadata (cắt khoảng trắng, giới hạn độ dài, mặc định "Học viên"); bỏ qua mọi khóa khác.
3. Hàm `is_admin()` (`security definer`, trả boolean, `stable`) dùng trong policy để tránh đệ quy RLS; chỉ cấp execute cho role cần thiết.
4. Admin đầu tiên và các admin sau được provision bằng câu lệnh SQL do chủ database chạy (Supabase SQL editor hoặc `psql` local); quy trình ghi ở task 004.
5. Không có UI/API gán role trong MVP.

## Hệ quả
- Ca P-9, P-10 bắt buộc trong integration test.
- Nếu sau này cần JWT custom claims để tối ưu hiệu năng, viết ADR mới; không đọc role từ `user_metadata`.
