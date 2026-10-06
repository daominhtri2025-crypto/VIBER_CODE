# Coding Academy — Bộ hướng dẫn Claude Code
Phiên bản 1.0 · 06/10/2026 · Ngôn ngữ: tiếng Việt.

Đây là bộ đặc tả và hướng dẫn, chưa phải ứng dụng chạy được. Không có dependency, database hay tài khoản được tạo sẵn.

## Bắt đầu
1. Clone repo VIBER_CODE và mở terminal tại thư mục gốc repo.
2. Đọc START_HERE.md và kiểm tra phạm vi MVP.
3. Chạy `claude` nếu Claude Code đã được cài đặt.
4. Dán nội dung prompts/01-review-spec.md. Nhiệm vụ này chỉ rà soát tài liệu.
5. Khi muốn bắt đầu code, dán prompts/02-bootstrap.md.
6. Giao từng task theo docs/tasks/BACKLOG.md; dùng prompts/03-implement-task.md.

CLAUDE.md là điểm vào. Quy tắc chuyên biệt nằm trong .claude/rules; đặc tả nằm trong docs. Không cần đọc toàn bộ tài liệu vào mỗi phiên.

## Giả định
Thương hiệu Coding Academy là tên tạm. MVP miễn phí, chỉ admin và student; chưa có marketplace, thanh toán, lớp học hay chạy code. Stack dự kiến: Next.js App Router, TypeScript, Tailwind CSS, Supabase. Version cụ thể được kiểm tra và khóa khi bootstrap.

## Kiểm tra
Bộ tài liệu không có npm scripts. Task 001 sẽ thiết lập lint, typecheck, test và build. Đừng chạy npm install trước khi đã giao nhiệm vụ bootstrap.

## Tham khảo
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/settings
- https://bumbii.tech/
- https://www.udemy.com/
Học cách tổ chức; không sao chép học liệu, thương hiệu hoặc đánh giá của website khác.
