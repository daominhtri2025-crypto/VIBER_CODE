# TASK-016: Dashboard và học tiếp
Status: pending

## Mục tiêu
Học viên quay lại đúng bài đang học.

## Phụ thuộc
015; Q04

## Tài liệu liên quan
SITEMAP, DATA_MODEL §4

## Phạm vi
- `/dashboard`: khóa đã enroll (live), %, nút "Học tiếp"; trạng thái rỗng dẫn tới catalog.
- `/learn/[courseSlug]` chuyển tới bài học tiếp.

## Ngoài phạm vi
- Thống kê, huy hiệu.

## Tiêu chí nghiệm thu
1. "Học tiếp" đúng thứ tự ưu tiên ở DATA_MODEL §4.
2. Khóa archived/draft sau khi enroll không hiển thị (theo Q04).
3. Chưa enroll khóa nào → trạng thái rỗng có liên kết catalog.
4. U vào `/learn/[courseSlug]` khóa chưa enroll → CTA đăng ký.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Unit | Chọn bài học tiếp | Pass |
| E2E | Xem bài 3 → đăng xuất/đăng nhập → Học tiếp | Mở bài 3 |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
