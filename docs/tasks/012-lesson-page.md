# TASK-012: Trang học bài
Status: pending

## Mục tiêu
Học viên đọc bài với mục lục, nội dung an toàn và video tùy chọn.

## Phụ thuộc
011; Q07

## Tài liệu liên quan
SITEMAP, UI_GUIDELINES (Trang học), .claude/rules/frontend.md

## Phạm vi
- `/learn/[courseSlug]/[lessonSlug]`: mục lục (drawer trên mobile), body Markdown sanitize, code block cuộn riêng, video allowlist, bài trước/sau.
- CTA cho K/U ở bài không preview; ghi `last_viewed_at` khi E xem (logic ở 015, gọi tại đây nếu 015 đã xong, nếu chưa thì để hook rõ ràng).

## Ngoài phạm vi
- Đánh dấu hoàn thành, dashboard.

## Tiêu chí nghiệm thu
1. K/U đọc được bài preview; bài khác chỉ thấy tiêu đề + CTA, payload không chứa body.
2. Bài không thuộc khóa trong URL → 404; bài published trong khóa draft → 404.
3. Markdown chứa `<script>`, `onerror`, `javascript:` không thực thi/không xuất hiện trong DOM.
4. video_url ngoài allowlist không nhúng; không có video → không khung rỗng.
5. Mobile 375px: mục lục dạng drawer, code cuộn ngang trong khối.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Unit | Renderer với payload XSS mẫu | Bị loại bỏ |
| E2E | K/U/E trên bài preview và không preview | Đúng quyền; kiểm tra network payload |
| E2E | Viewport 375/1280 | Bố cục đúng |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
