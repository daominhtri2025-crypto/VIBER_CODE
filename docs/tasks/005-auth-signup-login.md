# TASK-005: Đăng ký, đăng nhập, đăng xuất
Status: pending

## Mục tiêu
Người dùng tạo tài khoản và duy trì phiên đăng nhập an toàn.

## Phụ thuộc
003, 004; Q01, Q02, Q08

## Tài liệu liên quan
SITEMAP, USER_FLOWS §2, ADR-003

## Phạm vi
- Supabase client server/browser đã có (TASK-002, `src/lib/supabase`); bổ sung làm mới session ở proxy theo tài liệu Next 16.
- `/register`, `/login`, đăng xuất, `/auth/callback` (xác thực email nếu bật).
- Header hiển thị trạng thái đăng nhập; redirect `next` an toàn (chỉ đường dẫn nội bộ).

## Ngoài phạm vi
- Khôi phục mật khẩu, profile, OAuth.

## Tiêu chí nghiệm thu
1. Đăng ký thành công tạo phiên (hoặc yêu cầu xác thực email theo Q08).
2. Sai mật khẩu/email không tồn tại → cùng một thông điệp trung tính.
3. Validation server: email hợp lệ, mật khẩu theo chính sách Supabase đã cấu hình, display_name 1–50 ký tự.
4. `next=https://evil.example` bị bỏ qua, chuyển `/dashboard`.
5. Đăng xuất xóa phiên phía server; Back không hiện trang cá nhân.
6. Người đã đăng nhập vào `/login` → `/dashboard`.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | Đăng ký → đăng xuất → đăng nhập | Thành công |
| E2E | Sai mật khẩu; open redirect | Thông điệp trung tính; redirect nội bộ |
| Unit | Validate input và hàm lọc `next` | Pass |
| Thủ công | Email xác thực qua mail catcher local | Ghi kết quả hoặc blocked |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
