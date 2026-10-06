# TASK-020: Quản trị lộ trình (phụ thuộc Q03)
Status: pending

## Mục tiêu
Admin sắp xếp khóa trong lộ trình.

## Phụ thuộc
017, 009; Q03

## Tài liệu liên quan
DATA_MODEL

## Phạm vi
- `/admin/paths`, `/[id]`: CRUD path, thêm/bớt/sắp khóa. Bỏ task nếu Q03 chọn suy ra từ language.

## Ngoài phạm vi
- —

## Tiêu chí nghiệm thu
1. Thứ tự không trùng; khóa thêm vào phải tồn tại; non-admin bị từ chối.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | Thêm 2 khóa, đổi thứ tự, kiểm tra `/paths/[slug]` | Đúng thứ tự |
| Integration | Student ghi path_courses | Bị từ chối |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
