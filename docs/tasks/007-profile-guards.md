# TASK-007: Hồ sơ và bảo vệ route
Status: pending

## Mục tiêu
Người dùng sửa tên hiển thị; route cá nhân/admin được bảo vệ thống nhất.

## Phụ thuộc
005

## Tài liệu liên quan
SITEMAP §2, ACCESS_CONTROL §2

## Phạm vi
- `/profile`: sửa display_name, xem email, đổi mật khẩu khi đang đăng nhập.
- Helper server: `requireUser()`, `requireAdmin()` (→ 404 với non-admin), chuẩn mã lỗi action.
- Áp dụng cho `/dashboard`, `/profile`, `/admin/**` (layout admin rỗng có nhãn).

## Ngoài phạm vi
- Nội dung dashboard/admin.

## Tiêu chí nghiệm thu
1. K vào `/profile`, `/dashboard`, `/admin` → `/login?next=…`.
2. Student vào `/admin` → 404; admin → trang admin.
3. Sửa display_name rỗng/>50 ký tự → lỗi theo trường; hợp lệ → lưu và hiển thị ở header.
4. Action sửa profile không nhận `user_id` từ client.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | Ma trận K/student/admin × 3 route | Đúng SITEMAP |
| Integration | Gọi action sửa profile với id người khác | Không thay đổi dữ liệu B |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
