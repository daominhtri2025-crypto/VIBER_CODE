# TASK-005: Đăng ký khóa và học bài
Status: pending

## Phụ thuộc
004

## Phạm vi
Enroll miễn phí idempotent, mục lục chương/bài, renderer Markdown, video optional, preview.

## Tiêu chí nghiệm thu
Khách xem đúng preview; non-enrolled không xem private body; nested published trong draft ẩn; HTML độc hại không thực thi.

## Kiểm tra
E2E enroll/learn; query direct unauthorized; renderer sanitization.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS, liệt kê checks thật và hạn chế. Không làm task tiếp nếu chưa được giao.
