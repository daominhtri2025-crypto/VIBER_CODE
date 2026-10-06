# TASK-015: Đánh dấu hoàn thành và ghi bài đã xem
Status: pending

## Mục tiêu
Tiến độ học được lưu ở server, chính xác và idempotent.

## Phụ thuộc
012

## Tài liệu liên quan
DATA_MODEL §4

## Phạm vi
- Hàm thuần tính % tiến độ và "bài học tiếp".
- Actions: ghi `last_viewed_at`, đánh dấu/bỏ đánh dấu hoàn thành; nút trên trang học; mục lục hiện dấu hoàn thành.

## Ngoài phạm vi
- Dashboard (016).

## Tiêu chí nghiệm thu
1. Bấm hoàn thành nhiều lần → 1 bản ghi, `completed_at` không đổi.
2. Bỏ đánh dấu → % giảm; đánh dấu lại → % tăng.
3. 0 bài live → 0%; thêm bài mới publish → % giảm, bản ghi cũ giữ nguyên.
4. Bài bị chuyển draft không còn trong tử số và mẫu số.
5. Ghi progress cho bài draft hoặc khi chưa enroll → bị từ chối (P-14).

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Unit | Hàm % và học tiếp: 0 bài, tất cả xong, bài mới, bài draft | Pass |
| Integration | P-7, P-8, P-14 | Đúng kỳ vọng |
| E2E | Đánh dấu → đăng xuất → đăng nhập | Tiến độ còn |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
