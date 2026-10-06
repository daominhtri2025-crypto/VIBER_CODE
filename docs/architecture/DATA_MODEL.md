# Data model (baseline)
Tất cả PK UUID; timestamp timestamptz; FK có hành vi delete rõ trong migration. Mặc định không cascade xóa tiến độ khi xóa nội dung; ưu tiên archive hoặc chặn xóa được tham chiếu.

| Table | Trường chính | Ràng buộc |
|---|---|---|
| profiles | id → auth.users, display_name, created_at | id unique; không chứa role |
| user_roles | user_id → auth.users, role | PK user_id; role student/admin; không cho user tự ghi |
| learning_paths | id, slug, title, language, status | slug unique; draft/published |
| path_courses | path_id, course_id, position | PK(path_id,course_id); thứ tự unique trong path |
| courses | id, slug, title, summary, language, level, status | slug unique; draft/published/archived |
| chapters | id, course_id, title, position | unique(course_id,position) |
| lessons | id, chapter_id, slug, title, body_md, video_url, is_preview, status, position | slug global unique; unique(chapter_id,position) |
| enrollments | user_id, course_id, created_at | PK(user_id,course_id) |
| lesson_progress | user_id, lesson_id, completed_at, last_viewed_at | PK(user_id,lesson_id) |
| exercises | id, course_id, lesson_id nullable, slug, title, statement_md, hint1_md, hint2_md, language, difficulty, status | slug unique; lesson nếu có phải thuộc cùng course |
| exercise_solutions | exercise_id, solution_md | PK exercise_id; riêng để khóa nội dung |
| exercise_attempts | user_id, exercise_id, tried_at | PK(user_id,exercise_id); chỉ ghi own |

## Quy tắc
- language: scratch/python; level và difficulty: beginner/intermediate/advanced.
- lesson_id thuộc course kiểm tra tại server và constraint/trigger phù hợp.
- Enrollment miễn phí chỉ cho published course. Bài published trong draft course vẫn bị ẩn public.
- Publish trạng thái chỉ qua admin; kiểm tra dữ liệu đầy đủ tại server.
- Tiến độ = số bài published đã hoàn thành / tổng bài published; 0 bài = 0%; không tính preview riêng hai lần.
- Nếu thêm bài mới, phần trăm có thể giảm; giữ lịch sử hoàn thành cũ.
- last_viewed dùng cho học tiếp; fallback bài chưa hoàn thành đầu tiên.
- Role admin đầu tiên provision bằng thao tác quản trị server/manual được ghi hướng dẫn; không có 'tự trở thành admin'.
- Schema migration phải xác minh chi tiết triển khai và index, không coi bảng này là SQL đã chạy.
