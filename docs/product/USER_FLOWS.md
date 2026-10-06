# User flows
Mỗi luồng gồm luồng chính và các nhánh từ chối/lỗi. Hành vi từ chối tuân theo [SITEMAP §2](SITEMAP.md).

## 1. Khách
Trang chủ → chọn Scratch/Python → chi tiết khóa → đọc bài preview **hoặc** "Đăng ký khóa" → `/login?next=…` → (chưa có tài khoản) `/register`.
- Mở bài không preview → thấy tiêu đề + CTA, không thấy nội dung.
- Mở URL khóa draft → 404.

## 2. Đăng ký tài khoản
Nhập tên hiển thị (tùy chọn), email, mật khẩu → server tạo user → trigger tạo `profiles` + `user_roles(student)` (ADR-003) → xác thực email nếu bật (Q08) → `/dashboard`.
- Email đã tồn tại → thông báo trung tính, không xác nhận email có tồn tại hay không.
- Lỗi validation → giữ dữ liệu form trừ mật khẩu, hiện lỗi theo trường.

## 3. Học viên
Đăng nhập → chi tiết khóa → "Đăng ký khóa" (idempotent) → bài đầu tiên → đọc nội dung → bài tập liên quan → "Đánh dấu hoàn thành" → "Bài tiếp".
Phiên sau: `/dashboard` → "Học tiếp" → bài xem gần nhất (fallback: bài published chưa hoàn thành đầu tiên; nếu đã hoàn thành hết → bài đầu tiên).
- Bấm đăng ký/hoàn thành nhiều lần → không tạo bản ghi trùng.
- Bỏ đánh dấu hoàn thành → % giảm tương ứng.

## 4. Bài tập
Đề (+ví dụ) → hiện gợi ý 1 → hiện gợi ý 2 (nếu có) → "Tôi đã thử giải" (hộp thoại xác nhận) → server ghi `exercise_attempts` → server trả lời giải.
- Lời giải **không** nằm trong payload ban đầu của trang.
- Gọi trực tiếp action lấy lời giải khi chưa có attempt → `FORBIDDEN`.
- Chưa enroll → CTA đăng ký khóa.

## 5. Khôi phục mật khẩu
Nhập email → thông báo trung tính → email chứa link → recovery session hợp lệ → `/reset-password` → mật khẩu mới → đăng nhập.
- Link lỗi/hết hạn/đã dùng → hướng dẫn yêu cầu lại.

## 6. Admin
Tạo khóa (draft) → chương → bài (draft) → preview → publish bài → bài tập + lời giải → publish bài tập → publish khóa.
- Publish bài thiếu tiêu đề/nội dung → bị chặn, nêu trường thiếu.
- Publish khóa khi chưa có bài published → bị chặn.
- Unpublish bài published cuối cùng của khóa published → bị chặn (D10).
- Publish bài tập thiếu đề, gợi ý 1 hoặc lời giải → bị chặn (D11, Q14).
- Xóa nội dung đã có tiến độ/attempt/enrollment → bị chặn; hướng dẫn chuyển draft/archived.

## 7. Lỗi chung
Mutation thất bại giữ dữ liệu form; không hiện "thành công" trước khi server xác nhận. Mất kết nối → thông báo kèm "Thử lại".
