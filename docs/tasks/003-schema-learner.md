# TASK-003: Schema học viên, role và RLS cá nhân
Status: done (06/10/2026; thực hiện cùng TASK-002 — xem kết quả ở [002](002-schema-content.md))

## Mục tiêu
Dữ liệu học viên được tách biệt theo người dùng; không ai tự nâng quyền.

## Phụ thuộc
002

## Tài liệu liên quan
DATA_MODEL, ACCESS_CONTROL, ADR-003

## Phạm vi
- Migration `profiles`, `user_roles`, `enrollments`, `lesson_progress`, `exercise_attempts`.
- Trigger đăng ký tạo profile + role student; `is_admin()` thật.
- RLS cho bảng học viên; policy admin trên bảng nội dung; policy `exercise_contents`/`exercise_solutions` cho học viên.

## Ngoài phạm vi
- UI, seed, server actions.

## Tiêu chí nghiệm thu
1. Đăng ký user mới → có đúng 1 profile và role `student` (kể cả khi metadata có `role: admin`) (P-10).
2. User không ghi được `user_roles` (P-9).
3. A không đọc/sửa dữ liệu của B (P-7, P-8, P-15).
4. Enrollment khóa draft bị từ chối (P-12); progress cho bài draft bị từ chối (P-14).
5. Lời giải chỉ đọc được sau attempt (P-4, P-5, P-6).
6. Admin CRUD được mọi bảng nội dung.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Integration | P-4 → P-15 với client của K, A, B, admin | Đúng kỳ vọng |
| Integration | Đăng ký với metadata giả mạo role | role = student |
| Lệnh | `npm run test:integration` | Pass hoặc ghi blocked |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
