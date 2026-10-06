# TASK-011: Đăng ký khóa học
Status: pending

## Mục tiêu
Học viên đăng ký khóa miễn phí và bắt đầu học.

## Phụ thuộc
007, 010; Q10

## Tài liệu liên quan
ACCESS_CONTROL §2, DATA_MODEL §4

## Phạm vi
- Server action enroll idempotent; nút đăng ký/"Vào học" trên trang khóa; K → login với `next`.

## Ngoài phạm vi
- Hủy đăng ký (Q10).

## Tiêu chí nghiệm thu
1. Bấm 2 lần/2 tab → 1 bản ghi.
2. Enroll khóa draft bằng gọi action trực tiếp → `NOT_FOUND`.
3. Sau enroll chuyển tới bài đầu tiên; trang khóa hiện "Vào học".
4. Lỗi mạng → giữ trạng thái, thông báo thử lại.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | K → login → quay lại → enroll | Thành công, 1 bản ghi |
| Integration | Gọi action với khóa draft / user khác | Bị từ chối |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
