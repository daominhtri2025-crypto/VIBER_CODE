# TASK-008: Quản trị nội dung
Status: pending

## Phụ thuộc
006,007

## Phạm vi
CRUD draft/published khóa/chương/bài/bài tập/path, reorder, validation, upload asset admin nếu cần.

## Tiêu chí nghiệm thu
Student/anon không mutation; thứ tự không conflict; publish thiếu nội dung bị chặn; xóa tham chiếu được chặn/archive; asset không lộ đáp án.

## Kiểm tra
E2E admin và direct unauthorized mutation; RLS/storage nếu upload. Không UI cấp admin hay quản lý lớp.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS, liệt kê checks thật và hạn chế. Không làm task tiếp nếu chưa được giao.
