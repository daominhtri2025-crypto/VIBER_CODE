# TASK-007: Hồ sơ và bảo vệ route
Status: done (07/10/2026)

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

## Kết quả
- Mã: `src/features/auth/guards.ts` (`requireUser`, `requireAdmin`, mã lỗi `ActionErrorCode`), DAL thêm `isAdmin`; `src/features/profile/{actions.ts,components/*}`; `src/lib/supabase/stateless.ts`; trang `/profile`, `/admin` (tối thiểu, có nhãn); `/dashboard` dùng `requireUser`; header có "Trang của tôi", hồ sơ, "Quản trị" (chỉ admin).
- Kiểm tra quyền đặt ở page/action (không ở layout) theo tài liệu Next 16 (layout không chạy lại khi điều hướng).
- Đổi mật khẩu khi đang đăng nhập: xác minh mật khẩu hiện tại bằng client không cookie, thu hồi phiên tạm ngay sau đó.
- AC4 "action không nhận user_id": `updateDisplayName` chỉ dùng id từ `getCurrentUser()`; tầng DB đã chứng minh bằng P-15 (integration).
- Test: unit +2 ca (35); E2E `tests/e2e/profile-guards.spec.ts` 9 ca. AC 1–4 đạt.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
