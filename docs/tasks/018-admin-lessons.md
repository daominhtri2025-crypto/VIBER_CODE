# TASK-018: Quản trị bài học
Status: pending

## Mục tiêu
Admin soạn, preview và publish bài học.

## Phụ thuộc
017; Q07, Q15

## Tài liệu liên quan
DATA_MODEL §4, ADR-002

## Phạm vi
- `/admin/lessons/[id]`: tiêu đề, slug, summary, `is_preview`, body Markdown, video_url; preview dùng cùng renderer với trang học; lưu metadata + content trong một transaction.

## Ngoài phạm vi
- Upload ảnh (021).

## Tiêu chí nghiệm thu
1. Publish thiếu tiêu đề/body → bị chặn, chỉ rõ trường.
2. Unpublish bài published cuối cùng của khóa published → bị chặn (D10).
3. video_url ngoài allowlist → lỗi validation.
4. Lỗi lưu → giữ nội dung đang soạn; không hiện thành công giả.
5. Preview hiển thị giống trang học (cùng renderer, cùng sanitize).

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | Soạn → preview → publish → xem ở trang học với K/E | Đúng |
| Integration | Lưu khi lỗi giữa chừng | Không có lesson thiếu content |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
