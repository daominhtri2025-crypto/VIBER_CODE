# Backlog
Triển khai theo thứ tự. Mỗi task có status riêng; PROJECT_STATUS là điểm tiếp tục phiên.

| Task | Nhiệm vụ | Phụ thuộc |
|---|---|---|
| [000](000-review-spec.md) | Rà soát đặc tả | Không |
| [001](001-bootstrap.md) | Khởi tạo dự án | 000 |
| [002](002-database-rls.md) | Schema và phân quyền | 001 |
| [003](003-auth.md) | Tài khoản và session | 002 |
| [004](004-catalog.md) | Trang chủ, lộ trình, khóa học | 002,003 |
| [005](005-learning.md) | Đăng ký khóa và học bài | 004 |
| [006](006-exercises.md) | Bài tập, gợi ý và lời giải | 005 |
| [007](007-progress.md) | Tiến độ và học tiếp | 005 |
| [008](008-admin.md) | Quản trị nội dung | 006,007 |
| [009](009-acceptance.md) | Nghiệm thu MVP | 008 |
