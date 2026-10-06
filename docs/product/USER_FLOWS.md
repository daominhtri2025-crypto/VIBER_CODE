# User flows
## Khách
Trang chủ → chọn Scratch/Python → chi tiết khóa → học preview hoặc đăng ký tài khoản.
## Học viên
Đăng nhập → đăng ký khóa miễn phí → bài đầu → nội dung → bài tập → xác nhận hoàn thành → bài tiếp. Phiên sau: dashboard → học tiếp.
## Bài tập
Đề → gợi ý 1 → gợi ý 2 → xác nhận đã thử → server ghi exercise_attempt → được lấy lời giải. Không lấy solution cùng payload đề.
## Khôi phục mật khẩu
Nhập email → thông báo trung tính → email link → recovery session hợp lệ → mật khẩu mới. Link lỗi/hết hạn có hướng dẫn yêu cầu lại.
## Admin
Tạo draft khóa → chương → bài → bài tập → preview → publish. Không cho publish bài thiếu tiêu đề/nội dung; khóa phải có ít nhất một bài published.
## Lỗi
Mutation thất bại giữ dữ liệu form; không đánh dấu thành công trước khi server xác nhận. Enrollment và progress idempotent khi bấm lại.
