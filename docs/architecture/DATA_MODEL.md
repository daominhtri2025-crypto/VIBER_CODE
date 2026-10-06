# Data model (baseline tối thiểu)
Trạng thái: **implemented** (TASK-002, 06/10/2026) — migration trong `supabase/migrations/`, type sinh ở `src/types/database.ts`. Khi tài liệu và migration khác nhau, migration là nguồn sự thật về chi tiết kỹ thuật; cập nhật tài liệu này cùng migration mới.

Chi tiết triển khai: slug là domain `public.slug`; enum `learning_language`, `skill_level`, `content_status`, `app_role`; `video_url` chỉ nhận `https://www.youtube-nocookie.com/embed/<id 11 ký tự>` (Q07); unique vị trí là `deferrable` để sắp thứ tự trong transaction; hàm kiểm tra nằm ở schema `private` ([ADR-005](../decisions/005-supabase-local-and-rls-testing.md)). Không có bảng nhật ký hệ thống (Q16).

## 1. Quy ước chung
- PK là `uuid` (trừ bảng nối dùng PK ghép); thời gian dùng `timestamptz`; bảng nội dung có `created_at`, `updated_at`.
- `slug`: chữ thường ASCII, số, dấu `-`; độ dài 3–80; sinh từ tiêu đề tiếng Việt bằng cách bỏ dấu, admin có thể sửa.
- Enum (dạng `check` hoặc Postgres enum, chốt ở task 002):
  - `language` ∈ {scratch, python}
  - `level`, `difficulty` ∈ {beginner, intermediate, advanced}
  - `content_status` ∈ {draft, published, archived}
  - `role` ∈ {student, admin}
- Không xóa dây chuyền (cascade) dữ liệu học viên khi xóa nội dung: FK từ bảng học viên tới nội dung dùng `on delete restrict`; nội dung đã được tham chiếu thì chuyển draft/archived. Riêng bảng nội dung tách (`*_contents`, `exercise_solutions`) cascade theo bản ghi cha.
- Nội dung public/private được tách bảng để RLS thực thi theo hàng ([ADR-002](../decisions/002-content-projection.md)).

## 2. Bảng
### Danh tính và vai trò ([ADR-003](../decisions/003-identity-and-roles.md))
| Bảng | Trường | Ràng buộc |
|---|---|---|
| profiles | id → auth.users, display_name, created_at, updated_at | PK id, cascade khi xóa user; display_name 1–50 ký tự sau trim; không chứa role |
| user_roles | user_id → auth.users, role, granted_at | PK user_id (mỗi user một role); mặc định student; user không có quyền ghi |

### Nội dung
| Bảng | Trường | Ràng buộc |
|---|---|---|
| learning_paths (Q03) | id, slug, title, description, language, status, position | slug unique |
| path_courses (Q03) | path_id, course_id, position | PK(path_id, course_id); unique(path_id, position) |
| courses | id, slug, title, summary, objectives_md, requirements_md, cover_image_path, language, level, status, is_featured, position | slug unique; summary ≤ 300 ký tự |
| chapters | id, course_id, title, position | unique(course_id, position); không có status riêng |
| lessons | id, chapter_id, slug, title, summary, is_preview, status, position | slug unique toàn cục; unique(chapter_id, position) |
| lesson_contents | lesson_id (PK, FK), body_md, video_url | cascade theo lesson; video_url null hoặc HTTPS thuộc allowlist (Q07) |
| exercises | id, course_id, lesson_id (nullable), slug, title, difficulty, status, position | slug unique; unique(course_id, position); lesson (nếu có) phải thuộc cùng course (trigger) |
| exercise_contents | exercise_id (PK, FK), statement_md, hint1_md, hint2_md (nullable) | cascade theo exercise |
| exercise_solutions | exercise_id (PK, FK), solution_md | cascade theo exercise; MVP chỉ văn bản/mã (Q06) |

`language` của bài tập suy ra từ khóa, không lưu lặp lại.

### Dữ liệu học viên
| Bảng | Trường | Ràng buộc |
|---|---|---|
| enrollments | user_id, course_id, created_at | PK(user_id, course_id) |
| lesson_progress | user_id, lesson_id, last_viewed_at, completed_at (nullable) | PK(user_id, lesson_id) |
| exercise_attempts | user_id, exercise_id, tried_at | PK(user_id, exercise_id); chỉ insert, không sửa |

Index tối thiểu (xác minh theo truy vấn thực tế ở task 002/003): `chapters(course_id)`, `lessons(chapter_id)`, `exercises(course_id)`, `exercises(lesson_id)`, `lesson_progress(user_id, last_viewed_at desc)`, `enrollments(course_id)`.

## 3. Vị từ hiển thị (dùng chung cho RLS và truy vấn server)
- `course_live(c)` := `c.status = 'published'`
- `lesson_live(l)` := `l.status = 'published'` ∧ `course_live(course of l)`
- `exercise_live(x)` := `x.status = 'published'` ∧ `course_live(x.course)`
- `enrolled(u, c)` := ∃ enrollments(u, c)
- Chương chỉ hiển thị cho người không phải admin khi khóa live và chương có ít nhất một bài live.
- Bài tập gắn với bài học draft vẫn hiển thị nếu bài tập live; liên kết tới bài học bị ẩn.
- Archived: ẩn với mọi chủ thể trừ admin; dữ liệu học viên được giữ (Q04).

## 4. Quy tắc nghiệp vụ
- **Enrollment**: chỉ khi `course_live`; insert idempotent (`on conflict do nothing`).
- **Tiến độ khóa** = |{bài live của khóa có `completed_at` không null của user}| / |{bài live của khóa}|; mẫu số 0 → 0%. Bài preview tính như bài thường. Thêm bài mới có thể làm % giảm; lịch sử hoàn thành giữ nguyên.
- **Ghi tiến độ**: chỉ khi `enrolled` ∧ `lesson_live`. Xem bài → upsert `last_viewed_at`; đánh dấu → set `completed_at = now()` nếu đang null; bỏ đánh dấu → set `completed_at = null`.
- **Học tiếp** (theo khóa): bài live có `last_viewed_at` lớn nhất → nếu không có, bài live chưa hoàn thành đầu tiên theo (chapter.position, lesson.position) → nếu đã hoàn thành hết, bài live đầu tiên.
- **Attempt**: chỉ khi `enrolled` ∧ `exercise_live`; insert idempotent.
- **Publish** (kiểm tra tại server, nên có thêm trigger):
  - Bài: tiêu đề và `body_md` không rỗng.
  - Bài tập: `statement_md`, `hint1_md`, `solution_md` không rỗng (D11).
  - Khóa: có ít nhất một bài published.
  - Không cho unpublish/archive bài published cuối cùng của khóa đang published (D10).
- **Sắp thứ tự**: đổi vị trí thực hiện trong một transaction (RPC) để không vi phạm unique tạm thời; dùng constraint `deferrable` hoặc đánh số lại.
- **Provision admin**: chỉ qua SQL do chủ database chạy (hướng dẫn ở task 004); không có UI hoặc API tự nâng quyền.
