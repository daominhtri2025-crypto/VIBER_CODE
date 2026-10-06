# TASK-019: Quản trị bài tập và lời giải
Status: pending

## Mục tiêu
Admin soạn bài tập với gợi ý và lời giải được bảo vệ.

## Phụ thuộc
018; Q06, Q14

## Tài liệu liên quan
DATA_MODEL, ACCESS_CONTROL

## Phạm vi
- `/admin/exercises`, `/new`, `/[id]`: metadata, đề, hint1, hint2, lời giải, gắn bài học (cùng khóa), thứ tự, trạng thái.

## Ngoài phạm vi
- Chấm bài, test case tự động.

## Tiêu chí nghiệm thu
1. Publish thiếu đề/hint1/lời giải → bị chặn (D11).
2. Chọn bài học khác khóa → lỗi validation và bị DB chặn.
3. Trang admin là nơi duy nhất trả lời giải ngoài action 014.
4. Xóa bài tập đã có attempt → bị chặn, gợi ý chuyển draft.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | Tạo bài tập → publish → kiểm tra phía học viên | Đúng |
| Integration | Student đọc exercise_solutions trực tiếp | 0 dòng |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
