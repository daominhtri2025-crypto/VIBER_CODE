# Access control
Quyền được thực thi bằng **RLS + kiểm tra tại server**; giao diện chỉ phản ánh quyền. Vị từ `course_live`, `lesson_live`, `exercise_live`, `enrolled` định nghĩa trong [DATA_MODEL §3](DATA_MODEL.md). Hành vi route khi bị từ chối: [SITEMAP §2](../product/SITEMAP.md).

Chủ thể: **K** khách · **U** đã đăng nhập, chưa enroll khóa liên quan · **E** đã enroll · **A** admin. Mọi admin cũng có quyền U/E trên dữ liệu của chính mình.

## 1. Ma trận dữ liệu (SELECT / INSERT / UPDATE / DELETE)
| Bảng | K | U | E | A |
|---|---|---|---|---|
| courses, learning_paths, path_courses | S: live | S: live | S: live | SIUD toàn bộ |
| chapters | S: thuộc khóa live | như K | như K | SIUD |
| lessons (metadata) | S: `lesson_live` | như K | như K | SIUD |
| lesson_contents | S: `lesson_live` ∧ `is_preview` | như K | S: `lesson_live` ∧ `enrolled` | SIUD |
| exercises (metadata) | S: `exercise_live` | như K | như K | SIUD |
| exercise_contents (đề + gợi ý) | — | — | S: `exercise_live` ∧ `enrolled` | SIUD |
| exercise_solutions | — | — | S: `exercise_live` ∧ `enrolled` ∧ có attempt của chính mình | SIUD |
| profiles | — | S, U(display_name): của mình | như U | như U (Q09) |
| user_roles | — | S: của mình | S: của mình | S: của mình; không ghi qua API |
| enrollments | — | S own; I own nếu `course_live` | S own | như U/E trên dữ liệu của mình (Q09) |
| lesson_progress | — | — | S own; I/U own nếu `enrolled` ∧ `lesson_live` | như E trên dữ liệu của mình (Q09) |
| exercise_attempts | — | — | S own; I own nếu `enrolled` ∧ `exercise_live` | như E trên dữ liệu của mình (Q09) |
| Storage `public-assets` | Đọc | Đọc | Đọc | Ghi/xóa |

Không ai có DELETE trên bảng học viên trong MVP. Không ai có UPDATE trên `exercise_attempts`.

## 2. Ma trận hành động (server action)
| Hành động | K | U | E | A | Kiểm tra bắt buộc |
|---|---|---|---|---|---|
| Đăng ký khóa | UNAUTHENTICATED | ✓ | ✓ (idempotent) | ✓ | `course_live` |
| Đánh dấu/bỏ hoàn thành, ghi bài đã xem | UNAUTHENTICATED | FORBIDDEN | ✓ | ✓ nếu tự enroll | `enrolled` ∧ `lesson_live` |
| Xác nhận đã thử + lấy lời giải | UNAUTHENTICATED | FORBIDDEN | ✓ | ✓ | `enrolled` ∧ `exercise_live` |
| Sửa tên hiển thị | UNAUTHENTICATED | ✓ | ✓ | ✓ | chỉ bản ghi của mình; độ dài |
| CRUD/publish/reorder nội dung, upload | UNAUTHENTICATED | NOT_FOUND | NOT_FOUND | ✓ | `is_admin()`; bất biến publish |
| Gán role | — | — | — | — | Không có trong ứng dụng |

## 3. Nguyên tắc triển khai
- Tách bảng metadata public và nội dung private (ADR-002). Không cấp SELECT cho anon trên bảng chứa nội dung private.
- `is_admin()` là hàm `security definer`, `search_path` cố định, chỉ trả boolean, quyền execute tối thiểu, tránh đệ quy RLS (ADR-003).
- Trigger tạo profile/role khi đăng ký không đọc role từ `user_metadata`.
- Server dùng client theo session người dùng; **không** dùng service-role key ở runtime MVP hay trong browser.
- Kiểm thử quyền bằng client thường của từng chủ thể; không dùng service-role để chứng minh RLS hoạt động.
- Lời giải chỉ trả về qua action riêng sau khi kiểm tra; không đưa vào props/payload ban đầu.
- Storage: chỉ một bucket public cho ảnh bài học/đề; không chứa đáp án bị khóa (Q06).

## 4. Ca kiểm thử bắt buộc (dùng lại ở task 002, 003, 014, 015, 017, 022)
| # | Chủ thể | Hành vi | Kỳ vọng |
|---|---|---|---|
| P-1 | K | SELECT courses/lessons draft hoặc archived | 0 dòng |
| P-2 | K | SELECT lesson_contents bài không preview | 0 dòng |
| P-3 | K | SELECT lesson_contents bài preview live | Có dữ liệu |
| P-4 | U | SELECT exercise_contents | 0 dòng |
| P-5 | E | SELECT exercise_solutions khi chưa có attempt | 0 dòng |
| P-6 | E | INSERT attempt rồi SELECT solution | Có dữ liệu |
| P-7 | E (A) | SELECT/UPDATE lesson_progress của B | 0 dòng / bị từ chối |
| P-8 | E | INSERT attempt/progress với `user_id` của B | Bị từ chối |
| P-9 | U | UPDATE/INSERT user_roles thành admin | Bị từ chối |
| P-10 | Bất kỳ | Đăng ký với `user_metadata.role = 'admin'` | Role = student |
| P-11 | K/U/E | Bài published trong khóa draft | Ẩn |
| P-12 | U | INSERT enrollment khóa draft | Bị từ chối |
| P-13 | U/E | Gọi action admin trực tiếp | NOT_FOUND, dữ liệu không đổi |
| P-14 | E | INSERT progress cho bài draft | Bị từ chối |
| P-15 | U | UPDATE display_name của B | 0 dòng |
