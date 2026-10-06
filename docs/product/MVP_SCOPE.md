# MVP scope
Cập nhật: 06/10/2026 (TASK-000). Các câu hỏi mở được tham chiếu dạng Qxx trong [OPEN_QUESTIONS](../OPEN_QUESTIONS.md).

## 1. Có trong MVP
| Mô-đun | Chức năng | Task |
|---|---|---|
| Nền tảng | Website tiếng Việt, responsive, hai ngôn ngữ học: Scratch và Python | 001, 008 |
| Khóa học (public) | Trang chủ, catalog lọc theo ngôn ngữ/cấp độ, chi tiết khóa (mục tiêu, yêu cầu, chương trình), bài preview | 008, 010 |
| Lộ trình | Lộ trình Scratch/Python sắp thứ tự khóa (**phụ thuộc Q03**) | 009, 020 |
| Tài khoản | Đăng ký, đăng nhập, đăng xuất bằng email/mật khẩu; khôi phục mật khẩu; sửa tên hiển thị | 005–007 |
| Bài học | Đăng ký khóa miễn phí; đọc bài Markdown đã sanitize; video tùy chọn; mục lục chương/bài | 011, 012 |
| Bài tập | Danh sách/chi tiết; tối đa 2 mức gợi ý; mở lời giải sau xác nhận "Tôi đã thử giải" | 013, 014 |
| Tiến độ | Đánh dấu/bỏ đánh dấu hoàn thành; ghi bài xem gần nhất; % theo khóa; dashboard "Học tiếp" | 015, 016 |
| Quản trị | CRUD khóa/chương/bài/bài tập/lời giải; draft/published/archived; sắp thứ tự; preview; upload ảnh | 017–021 |

## 2. Ngoài MVP (để sau)
Chạy/chấm code, nộp file, thi có thời gian, lớp học, role giáo viên/phụ huynh, AI, thanh toán, review/rating, chứng chỉ, marketplace, đăng nhập mạng xã hội, đa ngôn ngữ giao diện, thống kê học viên theo cá nhân cho admin (Q09), hủy đăng ký khóa (Q10), thông báo email ngoài email xác thực/khôi phục.

## 3. Quy ước nghiệp vụ
- **Hoàn thành** là học viên tự đánh dấu, không phải chứng nhận đã hiểu bài. Học viên có thể bỏ đánh dấu.
- **Bài tập** không chấm điểm. Lời giải mở sau khi xác nhận "Tôi đã thử giải". Đây là cơ chế hỗ trợ học tập, không phải cơ chế chống gian lận.
- **Gợi ý** không phải dữ liệu bí mật đối với học viên đã enroll; việc hiện từng mức chỉ là trải nghiệm học (D07, Q05).
- **Preview**: bài có `is_preview` trong khóa published đọc được bởi mọi người, kể cả khách.
- Mọi tài khoản đăng nhập đều có quyền học viên trên dữ liệu của chính mình; admin có thêm quyền quản trị nội dung (D05).
- Dữ liệu demo phải gắn nhãn; không tạo số liệu, đánh giá hay testimonial giả.

## 4. Điều kiện trước khi phát hành public (không chặn phát triển local)
Chốt Q01–Q02 (dữ liệu trẻ em, cách tạo tài khoản), tên thương hiệu, tên miền, hosting, chính sách riêng tư/điều khoản, nội dung thật và quyền sử dụng học liệu/video.

## 5. Không được tự mở rộng
Nếu task đòi chức năng ngoài mục 1, nêu rõ thay đổi và cập nhật tài liệu này (cùng ADR nếu là quyết định kỹ thuật) trước khi triển khai.
