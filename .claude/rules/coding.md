# Coding conventions
- TypeScript strict; tránh any, dùng unknown và narrowing cho dữ liệu chưa xác thực.
- Tên code tiếng Anh, giao diện tiếng Việt; component PascalCase.
- Route chỉ điều phối; nghiệp vụ theo feature, không tạo service layer nếu chưa cần.
- Dùng thư viện sẵn có trước khi thêm dependency; giải thích dependency mới.
- Không bắt lỗi rồi bỏ qua; trả lỗi phù hợp, log không có secret/PII.
- Giữ diff trong phạm vi; không refactor phần không liên quan.
- Sau bootstrap, dùng lockfile và scripts đã thiết lập, không tự đổi package manager.
