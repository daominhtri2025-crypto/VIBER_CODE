# TASK-006: Khôi phục mật khẩu
Status: pending

## Mục tiêu
Người dùng quên mật khẩu đặt lại được bằng email.

## Phụ thuộc
005

## Tài liệu liên quan
USER_FLOWS §5

## Phạm vi
- `/forgot-password`, email recovery, `/reset-password`.

## Ngoài phạm vi
- Đổi email, xóa tài khoản.

## Tiêu chí nghiệm thu
1. Gửi yêu cầu với email bất kỳ → cùng thông điệp trung tính.
2. Link hợp lệ cho phép đặt mật khẩu mới và đăng nhập được bằng mật khẩu mới.
3. Link hết hạn/đã dùng/sai → trang hướng dẫn gửi lại, không lỗi trắng.
4. Truy cập `/reset-password` không có recovery session → hướng dẫn, không đổi được mật khẩu.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | Luồng đầy đủ qua mail catcher local | Pass hoặc blocked có lý do |
| E2E | Link sai/hết hạn | Trang hướng dẫn |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
