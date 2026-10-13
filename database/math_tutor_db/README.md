# Database SQLite cho Trợ lý AI học Toán THCS

Bộ database chạy được cho phiên bản nghiên cứu ban đầu. Đây là lớp dữ liệu và repository mẫu, chưa phải web hoàn chỉnh, dịch vụ đăng nhập hoặc bộ kiểm tra toán. Toàn bộ người dùng và kết quả đi kèm là dữ liệu giả lập. `ai-config-demo` là cấu hình giữ chỗ, không gọi AI thật.

## 1. Lựa chọn kiến trúc

SQLite phù hợp với một backend chạy trên một máy, dữ liệu được lưu trên ổ đĩa bền vững. Không đặt file database trong thư mục public hoặc để trình duyệt tải file đang sử dụng. Không sử dụng file SQLite trên ổ đĩa tạm của serverless cho dữ liệu cần lưu lâu dài. WAL hỗ trợ đọc/ghi đồng thời nhưng vẫn chỉ có một writer tại một thời điểm; không đặt database WAL trên ổ mạng chia sẻ giữa nhiều máy.

Các quan hệ lớp học, giao bài, phiên giải và bài kiểm tra thuận lợi cho mô hình quan hệ. Vì vậy bản này chọn SQLite; không cần triển khai MongoDB đồng thời. Nếu chuyển sang MongoDB, phải thiết kế lại collection, index và các kiểm tra liên kết ở backend, không chỉ đổi chuỗi kết nối.

## 2. Thành phần

| File | Vai trò |
|---|---|
| `schema.sql` | Bảng, khóa ngoại, CHECK, index, trigger, view |
| `seed.sql` | Dữ liệu minh họa: 5 người dùng, 3 bài, một phiên học và một kết quả kiểm tra |
| `init_db.py` | Tạo database mới; không ghi đè file đã có |
| `db.py` | Mở kết nối có khóa ngoại và timeout; hàm backup |
| `session_repository.py` | Lưu bước nguyên tử, kiểm tra chủ sở hữu, chống trùng và xung đột phiên bản |
| `queries.sql` | Truy vấn mẫu có tham số |
| `export_results.py` | Xuất kết quả một đợt nghiên cứu theo mã học sinh |
| `tests.py` | 18 kiểm thử ràng buộc và thao tác repository |
| `DATA_DICTIONARY.md` | Danh sách cột và kiểu dữ liệu được sinh từ database thực |
| `data/math_tutor_demo.db` | Database mẫu mở được ngay |

## 3. Chạy trên máy

Yêu cầu Python 3.10 trở lên, SQLite đi kèm Python phiên bản 3.38 trở lên để có JSON functions. Không cần cài package Python bên ngoài.

Kiểm tra phiên bản:

```bash
python3 -c "import sqlite3; print(sqlite3.sqlite_version)"
```

Giải nén và chuyển vào thư mục `math_tutor_db`, sau đó:

```bash
# Database mới có dữ liệu mẫu
python3 init_db.py --db data/my_demo.db --demo

# Database sạch chỉ có schema và 4 vai trò mặc định
python3 init_db.py --db data/my_app.db

# Kiểm thử trên database tạm, không sửa file đang sử dụng
python3 tests.py

# Xuất kết quả minh họa
python3 export_results.py --db data/math_tutor_demo.db --study study-demo --out results.csv
```

Trên Windows, thay `python3` bằng `py` hoặc `python` tùy cấu hình. Có thể mở `.db` trong phần mềm xem SQLite. Không cần mật khẩu cho file demo; SQLite không cung cấp xác thực người dùng theo tài khoản database.

## 4. Các nhóm bảng

| Nhóm | Bảng |
|---|---|
| Tài khoản | users, roles, user_roles |
| Lớp học | classes, class_members |
| Nội dung | topics, problems, problem_versions |
| Giao bài | assignments, assignment_problems |
| Cấu hình | ai_configs |
| Học tập | learning_sessions, solution_steps, hint_events, messages, activity_events, feedback_reports |
| Nghiên cứu | studies, study_researchers, study_groups, study_participants |
| Kiểm tra | assessments, assessment_items, assessment_attempts, item_responses |
| Migration | schema_migrations |

Một `problem` có nhiều `problem_versions`. Khi bài đã duyệt, không sửa nội dung phiên bản đó; thêm phiên bản mới để không làm thay đổi dữ liệu lịch sử. Bài giao và phiên học tham chiếu cả `problem_id` và `problem_version`.

Một `assignment` chứa nhiều bài qua `assignment_problems`. Một học sinh có thể có nhiều phiên cho một bài. Trong cùng phiên, `request_id` là duy nhất để chống gửi trùng.

Một đợt nghiên cứu gồm nhiều nhóm. Mỗi học sinh chỉ có một bản ghi tham gia trong một đợt, nhưng có thể tham gia các đợt khác nhau. Khóa ngoại ghép ngăn bài nộp tham chiếu item của một đề kiểm tra khác hoặc học sinh của đợt khác.

## 5. Quy ước dữ liệu

- ID: TEXT, ứng dụng sinh UUID. ID demo dễ đọc chỉ phục vụ minh họa.
- Thời gian: TEXT UTC theo ISO 8601 dạng `YYYY-MM-DDTHH:MM:SS.sssZ`. Backend chuẩn hóa trước khi lưu. Database không kiểm tra đầy đủ định dạng thời gian.
- JSON: TEXT với `json_valid`; backend còn phải kiểm tra cấu trúc và giới hạn kích thước.
- Điểm: REAL, không âm, không vượt điểm tối đa của item; backend xử lý quy tắc làm tròn.
- `math_status`: valid, invalid, unknown. Không coi unknown là sai.
- `learning_mode`: guided, practice, independent.
- `phase`: pre, post, retention.
- `solution_steps` là lịch sử các lần thử: khi sửa lỗi, tạo dòng mới, không sửa dòng cũ.
- `teacher_solution` và `hints` không được trả về trong API đề kiểm tra độc lập.

## 6. Tích hợp backend

Mở mỗi kết nối qua `db.connect()` để bật `PRAGMA foreign_keys=ON`. Quy định này áp dụng cho mọi worker, script và công cụ sửa dữ liệu; không chỉ lúc khởi tạo.

```python
from db import connect
from session_repository import submit_step

conn = connect('data/math_tutor_demo.db')
try:
    step = submit_step(
        conn,
        actor_id='student-a',  # lấy từ token đã xác thực ở backend
        session_id='session-demo',
        expected_version=2,
        request_id='example-submit-3',
        previous_equation='2*x=12',
        submitted_equation='x=6',
        operation='divide_both_sides',
        operation_value='2',
        explanation='Em chia hai vế cho 2',
        math_status='valid',  # lấy từ MathChecker, không nhận từ trình duyệt
    )
    print(step['id'])
finally:
    conn.close()
```

Luồng chuẩn: xác thực → kiểm tra quyền → phân tích và kiểm tra toán → chuẩn bị phản hồi → giao dịch ngắn lưu bước → trả kết quả. Không gọi AI bên trong giao dịch đang giữ khóa ghi. Ví dụ trên chỉ minh họa lưu bước, không kiểm tra biểu thức hay sinh phản hồi AI.

Nếu version không khớp, tải lại phiên rồi xác định lại bước hiện tại. Với cùng request_id và cùng payload, repository trả bước đã lưu, không ghi thêm. Với request_id cũ nhưng payload khác, yêu cầu bị từ chối.

Lấy danh sách bằng truy vấn có tham số:

```python
rows = conn.execute(
    'SELECT * FROM session_summary WHERE student_id=?',
    (student_id_from_token,)
).fetchall()
```

Không nối chuỗi SQL từ dữ liệu người dùng. Các view không thực hiện phân quyền; endpoint phải kiểm tra quyền trước khi truy vấn.

## 7. Phân quyền phải thực hiện ở backend

| Vai trò | Kiểm tra |
|---|---|
| Học sinh | student_id bằng ID từ token; thành viên lớp; phiên thuộc chính mình |
| Giáo viên | Có vai trò teacher và là teacher_id của lớp; chỉ chấm lớp hoặc đợt được giao |
| Nghiên cứu | Có vai trò researcher và xuất hiện trong study_researchers của đợt |
| Quản trị | Quyền thao tác kỹ thuật theo chính sách; không mặc nhiên thay đổi điểm |

users.auth_subject ánh xạ đến định danh từ dịch vụ đăng nhập. Không lưu mật khẩu thô; bộ này không triển khai dịch vụ xác thực. Backend phải kiểm tra user_roles khi tạo lớp, thêm thành viên, duyệt bài hoặc chấm. Khóa ngoại chỉ xác nhận ID tồn tại, không chứng minh người đó có đúng vai trò.

## 8. Báo cáo

- `session_summary`: số bước thử, số bước sai, tổng gợi ý, số lượt xin gợi ý và mức hỗ trợ cao nhất. Số bước là số lần thử, không phải số bước tối ưu của lời giải.
- `assessment_totals`: điểm tổng chỉ có khi đã nộp và mọi item đều được chấm. Chưa chấm đầy đủ trả NULL, không trả 0.
- `research_results`: chỉ dùng mã tham gia, nhóm và kết quả; endpoint lọc theo đợt được cấp quyền.

Mã tham gia là dữ liệu giả danh, không đảm bảo ẩn danh tuyệt đối vì database còn giữ bảng ánh xạ. Không xuất bảng ánh xạ kèm kết quả nghiên cứu. Không diễn giải số gợi ý thành điểm phụ thuộc AI một cách tự động.

Thời gian hoạt động chưa được tính sẵn: activity_events chỉ lưu sự kiện. Backend cần quy tắc pause/resume/heartbeat và ngưỡng bỏ khoảng nghỉ; không dùng tổng thời gian từ started_at đến completed_at thay cho thời gian thực học.

## 9. Ràng buộc và phần còn lại

Đã kiểm tra: khóa ngoại; bất biến phiên bản bài đã duyệt; uniqueness bước và request; gợi ý bị chặn trong phiên independent hoặc trạng thái INDEPENDENT_PRACTICE; liên kết hint-step cùng phiên; đúng lớp và mode khi mở phiên bài giao; một nhóm mỗi đợt; đúng đề của item; điểm tối đa; tổng hợp không nhân số bản ghi.

Backend còn phải kiểm tra: chuỗi chuyển trạng thái hợp lệ; logic toán học; nội dung gợi ý; JSON theo schema; quyền duyệt/chấm; người dùng bị khóa; thời hạn giao bài; tính đầy đủ trước khi nộp kiểm tra. Database không chống người có quyền truy cập file trực tiếp sửa/xóa dữ liệu, không chứa cơ chế audit đầy đủ. Không dùng script export như một API công khai.

Phiên bản schema ban đầu là 1. init_db.py chỉ khởi tạo; không phải migration runner. Khi đổi schema cho dữ liệu đang dùng, viết migration mới và backup trước, không chạy lại schema.sql.

## 10. Vận hành và backup

Đặt database trên ổ đĩa local bền vững của backend. WAL chỉ có một writer nên dùng giao dịch ngắn, busy_timeout, và xử lý lỗi khóa bận ở tầng ứng dụng. Trình duyệt chỉ gọi API; không truy cập file database.

Backup database đang chạy bằng API:

```python
from db import backup
backup('data/my_app.db', 'data/backup_20261013.db')
```

Không chỉ sao chép file `.db` khi đang dùng WAL, vì dữ liệu mới có thể còn trong `.db-wal`. Khóa API AI nằm trong biến môi trường backend, không lưu trong ai_configs.

## 11. Tài liệu chính thức

- SQLite khóa ngoại: https://www.sqlite.org/foreignkeys.html
- SQLite WAL và giới hạn writer: https://www.sqlite.org/wal.html
- SQLite PRAGMA: https://www.sqlite.org/pragma.html

## 12. Gợi ý chuyển sang MongoDB

Nếu bắt buộc dùng MongoDB: tách collections users, classes, problems, problem_versions, assignments, sessions, steps, hints, messages, studies, participants, assessments, attempts, responses. Giữ steps/messages là collection riêng vì lịch sử có thể tăng lớn. Tạo unique compound index cho (session_id, request_id), (session_id, step_index), (study_id, student_id), (attempt_id, item_id). Dùng transaction cho việc thêm bước và tăng version. Khóa ngoại và các trigger ở bản SQLite phải được thay bằng kiểm tra nghiệp vụ, schema validator và giao dịch thích hợp. Đây là hướng chuyển đổi, chưa có bộ MongoDB thực thi trong gói này.
