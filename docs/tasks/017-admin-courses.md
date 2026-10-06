# TASK-017: Quản trị khóa học và chương
Status: pending

## Mục tiêu
Admin tạo, sửa, publish khóa và quản lý chương.

## Phụ thuộc
007, 004; Q09

## Tài liệu liên quan
ACCESS_CONTROL §2, USER_FLOWS §6, UI_GUIDELINES

## Phạm vi
- `/admin` tổng quan đếm nội dung theo trạng thái.
- `/admin/courses`, `/new`, `/[id]`: CRUD khóa (slug tự sinh có thể sửa), chương, sắp thứ tự chương/bài (RPC transaction), đổi trạng thái.

## Ngoài phạm vi
- Biên tập bài học, bài tập, upload ảnh.

## Tiêu chí nghiệm thu
1. Student/K gọi mọi action admin → bị từ chối, dữ liệu không đổi (P-13).
2. Publish khóa chưa có bài published → bị chặn với thông điệp rõ.
3. Reorder không gây trùng position kể cả khi thao tác nhanh liên tiếp.
4. Xóa khóa/chương đã có enrollment/progress → bị chặn, gợi ý archived/draft.
5. Trạng thái draft/published/archived phân biệt bằng chữ, không chỉ màu.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Integration | P-13 cho từng action admin | Bị từ chối |
| E2E | Tạo khóa → chương → reorder → publish (bị chặn khi thiếu bài) | Đúng kỳ vọng |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
