# TASK-021: Upload ảnh cho bài học và đề bài
Status: pending

## Mục tiêu
Admin chèn ảnh (ví dụ khối lệnh Scratch) vào nội dung.

## Phụ thuộc
018; Q06

## Tài liệu liên quan
ACCESS_CONTROL (Storage), ARCHITECTURE

## Phạm vi
- Bucket `public-assets`; policy chỉ admin ghi/xóa; kiểm tra loại (PNG/JPEG/WebP/GIF) và kích thước tối đa (đề xuất 2 MB); chèn Markdown kèm alt text bắt buộc.

## Ngoài phạm vi
- Ảnh trong lời giải (Q06), video upload.

## Tiêu chí nghiệm thu
1. Student/K upload → bị từ chối.
2. File sai loại/quá cỡ → lỗi rõ ràng; tên file được chuẩn hóa, không ghi đè file khác.
3. Thiếu alt text → không chèn được.
4. Trình soạn lời giải không có nút chèn ảnh.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Integration | Upload bằng client student | Bị từ chối |
| E2E | Upload ảnh hợp lệ, chèn vào bài, xem với K | Hiển thị, có alt |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
