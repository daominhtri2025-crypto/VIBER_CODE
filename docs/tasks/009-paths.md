# TASK-009: Lộ trình học (phụ thuộc Q03)
Status: pending

## Mục tiêu
Khách thấy thứ tự khóa trong lộ trình Scratch/Python.

## Phụ thuộc
008; Q03

## Tài liệu liên quan
SITEMAP, DATA_MODEL

## Phạm vi
- `/paths`, `/paths/[slug]` theo phương án Q03 đã chốt.

## Ngoài phạm vi
- Admin path (020).

## Tiêu chí nghiệm thu
1. Chỉ path và khóa live hiển thị, đúng thứ tự.
2. Path draft/không tồn tại → 404.
3. Path không có khóa live → trạng thái rỗng có hướng dẫn.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | Path có khóa draft xen giữa | Khóa draft bị ẩn, thứ tự còn lại đúng |
| E2E | Slug sai | 404 |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
