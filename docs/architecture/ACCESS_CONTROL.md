# Access control
Quyền phải có ở server và RLS, không chỉ giao diện.

| Resource | Anon | Student | Admin |
|---|---|---|---|
| Course/path metadata | Published | Published | Toàn bộ + CRUD |
| Chapter/lesson metadata | Thuộc khóa published và bài published | Như anon | Toàn bộ |
| Lesson body/video | Published preview trong published course | Published trong khóa enrolled | Toàn bộ |
| Exercises/hints | Chỉ metadata published, không body riêng | Published, enrolled course | Toàn bộ + CRUD |
| Solutions | Không | Enrolled + published + own tried record | Toàn bộ + CRUD |
| Profiles | Không | Đọc/sửa display_name của mình | Đọc khi cần quản trị; MVP không sửa hộ |
| User roles | Không | Đọc role mình; không ghi | Đọc; không có UI tự cấp role trong MVP |
| Enrollment | Không | Đọc own, insert own published course | Đọc; MVP không cấp hộ |
| Progress/attempt | Không | Own CRUD hợp lệ, enrolled course | Đọc để quản trị; không ghi hộ |

## Triển khai
Nếu metadata public và body private ở cùng table, RLS theo row không đủ để ẩn cột. Tách query/view public chỉ lộ metadata; dùng view security_invoker hoặc RPC kiểm tra quyền và projection rõ, không cho anon SELECT toàn bộ table chứa body. Có thể tách lesson_contents/exercise_contents khi triển khai nếu giúp enforcement; ghi ADR và cập nhật DATA_MODEL.
Solution ở table riêng; policy yêu cầu own attempt + enrollment + published parent course. Bấm 'đã thử' chỉ mở lời giải, không chứng minh làm đúng.
Role lookup tránh RLS recursion; nếu dùng security-definer helper, cố định search_path, quyền execute tối thiểu, không trả dữ liệu nhạy cảm.
Storage: chỉ admin upload; public asset không chứa đáp án bị khóa hoặc dữ liệu riêng. Không dùng service-role trên browser.
## Cases phải thử
Anon đọc draft; student A đọc/sửa progress B; tự đổi role; enrolled user lấy solution chưa tried; nested published lesson trong draft course; gọi API trực tiếp bỏ qua UI.
