# TASK-002: Schema nội dung và RLS nội dung
Status: done (06/10/2026; gộp phần schema/RLS của TASK-003 theo yêu cầu người dùng)

## Mục tiêu
Nội dung khóa học được lưu đúng ràng buộc; khách chỉ đọc được những gì được phép.

## Phụ thuộc
001; Q03, Q04, Q12 (dùng mặc định nếu chưa chốt)

## Tài liệu liên quan
DATA_MODEL §1–3, ACCESS_CONTROL, ADR-002, .claude/rules/database.md

## Phạm vi
- Thiết lập Supabase local (CLI) theo Q12.
- Migration: enum/check, `courses`, `chapters`, `lessons`, `lesson_contents`, `exercises`, `exercise_contents`, `exercise_solutions` (+ `learning_paths`, `path_courses` nếu Q03 giữ).
- Constraint/trigger: slug, unique position, bài tập–bài học cùng khóa, `updated_at`, bất biến publish (DATA_MODEL §4).
- RLS cho anon/authenticated trên bảng nội dung; `is_admin()` dạng stub trả false cho tới task 003.

## Ngoài phạm vi
- Bảng học viên, trigger đăng ký, seed đầy đủ, UI.

## Tiêu chí nghiệm thu
1. Migration chạy từ DB trống (`supabase db reset`) không lỗi.
2. Anon không đọc được hàng draft/archived và nội dung private (P-1, P-2, P-11).
3. Anon đọc được bài preview live (P-3).
4. Insert bài tập có `lesson_id` thuộc khóa khác bị từ chối.
5. Publish bài thiếu body bị từ chối ở tầng DB.
6. ADR-002 chuyển trạng thái accepted hoặc ghi lý do điều chỉnh.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Integration | P-1, P-2, P-3, P-11 với client anon | Đúng kỳ vọng |
| Integration | Vi phạm constraint (slug trùng, position trùng, lesson khác khóa) | Lỗi constraint |
| Lệnh | `npm run test:integration` | Pass hoặc ghi blocked nếu thiếu Docker |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Kết quả
- Migration: `supabase/migrations/2026100609{0000,0100,0200,0300}_*.sql` (14 bảng, bất biến, RLS + grant).
- Client: `src/lib/supabase/{env,server,client}.ts`; type `src/types/database.ts`.
- Test: `tests/integration/{schema,rls}.test.ts` — 48/48 pass; mutation check 3 policy → 4 test fail đúng chỗ.
- AC 1–6 đạt; chi tiết lệnh trong PROJECT_STATUS.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
