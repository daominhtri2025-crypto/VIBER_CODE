# TASK-007: Tiến độ và học tiếp
Status: pending

## Phụ thuộc
005

## Phạm vi
Progress idempotent, last_viewed, dashboard, continue học, reset completion own.

## Tiêu chí nghiệm thu
Phần trăm đúng bài published; 0 bài=0%; bấm lại không duplicate; tiến độ còn sau login lại; user khác bị từ chối.

## Kiểm tra
Unit logic và integration/E2E persistence; thêm bài mới cập nhật tỷ lệ.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS, liệt kê checks thật và hạn chế. Không làm task tiếp nếu chưa được giao.
