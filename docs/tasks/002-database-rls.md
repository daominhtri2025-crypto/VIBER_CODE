# TASK-002: Schema và phân quyền
Status: pending

## Phụ thuộc
001

## Phạm vi
Migration, seed demo, RLS, projection public/private, role provisioning hướng dẫn và DB types.

## Tiêu chí nghiệm thu
Anon không đọc draft/private; A không đọc/sửa B; không tự nâng role; solution bị khóa đúng; seed có đủ quan hệ.

## Kiểm tra
Integration với Supabase local, case trong ACCESS_CONTROL. Không dùng service-role để test student.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS, liệt kê checks thật và hạn chế. Không làm task tiếp nếu chưa được giao.
