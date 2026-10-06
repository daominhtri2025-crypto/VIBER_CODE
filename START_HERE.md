# Hướng dẫn sử dụng
## Lần đầu
- Đọc README.md, docs/product/MVP_SCOPE.md và docs/decisions/001-initial-decisions.md.
- Có thể đổi tên thương hiệu trong PRODUCT_BRIEF.md; cập nhật tài liệu liên quan để tránh mâu thuẫn.
- Không ghi khóa thật vào tài liệu hoặc .env.example.
- Bộ này không chứa code ứng dụng; không có chức năng đã hoàn thành.

## Mỗi phiên Claude Code
Khởi động tại thư mục gốc. Yêu cầu đọc CLAUDE.md, PROJECT_STATUS.md và task hiện tại. Kiểm tra các hướng dẫn đã nạp bằng /memory theo phiên bản Claude Code đang dùng. Nếu rule theo đường dẫn chưa được nạp, yêu cầu đọc file rule liên quan trực tiếp.

## Thứ tự
Rà soát đặc tả → bootstrap → schema/RLS → auth → catalog → learning → exercises → progress → admin → nghiệm thu.

## Chốt trước khi public
Tên thương hiệu, nội dung thật, video và quyền sử dụng, tên miền, môi trường triển khai, chính sách riêng tư. Không chặn việc lập trình local vì các mục này chưa chốt.

## Tính chất hướng dẫn
CLAUDE.md không phải cơ chế cưỡng chế bảo mật. Quyền dữ liệu được thực thi bằng RLS và kiểm tra server; chất lượng được xác minh bằng test và review. settings.json ban đầu dùng quyền mặc định, không tự cho phép mọi lệnh.
