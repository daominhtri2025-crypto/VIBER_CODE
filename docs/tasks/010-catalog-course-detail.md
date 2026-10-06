# TASK-010: Catalog và chi tiết khóa học
Status: pending

## Mục tiêu
Khách tìm và xem chi tiết khóa phù hợp.

## Phụ thuộc
008

## Tài liệu liên quan
SITEMAP, DATA_MODEL §3

## Phạm vi
- `/courses` lọc `language`, `level` (kết hợp, phản ánh trên URL).
- `/courses/[slug]`: mục tiêu, yêu cầu, chương trình (chương/bài live), đánh dấu bài preview, nút đăng ký (hành vi ở 011).

## Ngoài phạm vi
- Enroll, trang học.

## Tiêu chí nghiệm thu
1. Chỉ khóa live; khóa draft/archived → 404 cho non-admin.
2. Bộ lọc kết hợp đúng; không có kết quả → trạng thái rỗng + nút xóa lọc.
3. Chương không có bài live bị ẩn; bài draft không xuất hiện trong chương trình.
4. Lỗi truy vấn → trang lỗi có "Thử lại".

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | Lọc scratch+beginner; lọc rỗng | Đúng tập kết quả |
| E2E | URL khóa draft với K và student | 404 |
| Integration | Truy vấn catalog bằng client anon | Không trả trường private |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
