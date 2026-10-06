---
paths:
  - "src/app/**/*"
  - "src/components/**/*"
  - "src/features/**/components/**/*"
---
# Frontend
- Đọc docs/design/UI_GUIDELINES.md.
- Ưu tiên server components; client components cho tương tác cần thiết.
- Có label, focus visible, trạng thái disabled/loading, lỗi form cụ thể.
- Mobile không tràn ngang; sidebar thành drawer; code có vùng cuộn riêng.
- Nội dung bài học dùng renderer được sanitize; không render HTML tùy ý.
- Không gửi dữ liệu riêng tư/khóa đáp án vào props phía client.
