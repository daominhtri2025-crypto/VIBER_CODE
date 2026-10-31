# Kiến trúc và bàn giao

## Cấu trúc
| Thư mục/tệp | Vai trò |
|---|---|
| public/home.html | Giao diện học tập, thích ứng điện thoại |
| public/app.js | Nội dung bài học, câu kiểm tra và tiến độ trên thiết bị |
| public/resources.js | Phiếu đánh giá cục bộ, sao lưu/khôi phục, tài liệu hỗ trợ |
| public/online.js | Đăng nhập, đồng bộ API, video và nút đánh dấu hoàn thành trong bài học |
| public/home.html, public/home-polish.css, public/home-service.css, public/home-service.js, public/home-service-art.js | Trang chủ theo bố cục dịch vụ công: bài đang học, chủ đề, tin tức, bài học, tiến độ, tài liệu, hỏi đáp. Minh họa là SVG vẽ tay, không dùng ảnh bên ngoài. |
| shared/ | Quy tắc nghiệp vụ dùng chung (kiểm tra bài học, phiếu, video, tiến độ); được `tsc --strict` kiểm tra |
| public/admin.html, public/admin.js, public/admin-report.js | Điều phối: đăng nhập email và mật khẩu, menu bên trái, tài khoản tình nguyện viên, báo cáo thống kê (bộ lọc, bảng, CSV có BOM), ghi phiếu quan sát và tải video |
| public/print.html, public/qr | Sổ tay, poster, phiếu và mã QR |
| app/api/[...path]/route.ts | API máy chủ, kiểm tra quyền và lưu D1/R2 |
| db/schema.ts | Schema Drizzle |
| drizzle/ | SQL migration, snapshot và nhật ký migration |
| build/, scripts/ | Tích hợp môi trường build và chạy |
| tests/*.test.mjs | Kiểm tra API, migration, phiếu, bài học, video và tiến độ bằng SQLite thật; chạy bằng `npm test` |

## Dữ liệu
- learners: khóa danh tính ổn định theo website, mã học viên, ngày tạo.
- progress: mỗi học viên/bài học một bản ghi; đã đọc, tự thực hành (done), kiểm tra đạt, thời gian cập nhật và `completed_at` (thời điểm lần đầu tự xác nhận hoàn thành; NULL với dòng tạo trước migration 0003).
- assessments: phiếu quan sát 5 kỹ năng, lần đo, người đánh giá, thời gian.
- quiz_attempts: mỗi lượt làm bài kiểm tra một dòng (bài, lựa chọn, `correct` do máy chủ tính, `client_id`); unique theo `(learner, client_id)`. Không sửa hay xóa lịch sử qua API.
- staff: email tài khoản được quyền đánh giá.
- videos: bài học, khóa tệp trong R2, loại video, thời lượng và thời gian cập nhật.
- accounts (migration 0006): tài khoản quản trị và tình nguyện viên; mật khẩu chỉ lưu dạng băm PBKDF2-SHA256, kèm số lần sai, thời điểm khóa tạm và cờ buộc đổi mật khẩu.
- sessions (migration 0006): phiên đăng nhập; chỉ lưu băm SHA-256 của mã phiên, không lưu mã gốc.
- password_reset_tokens (migration 0008): token khôi phục mật khẩu qua email. Chỉ lưu băm SHA-256 của token; hết hạn sau 15 phút; `used_at` đánh dấu đã dùng hoặc đã vô hiệu hóa.
- news (migration 0007): tin tức trang chủ. Quản trị viên đăng, sửa, ẩn tin qua `/api/admin/news`; `GET /api/news` chỉ trả tin chưa ẩn. Liên kết nguồn chỉ nhận https, kiểm tra cả trong CSDL. Không có cào dữ liệu ở giai đoạn này.
- lessons (migration 0010): thêm `updated` và `hidden`; mã bài từ 0 đến 999 (CHECK `lessons_lesson_min`; giới hạn trên do máy chủ kiểm tra). `lesson_versions` (migration 0010): bản trước của bài mỗi lần sửa, khóa ngoại tới `lessons`.
- Quản lý bài học (`/api/admin/lessons*`, chỉ quản trị viên): danh sách phân trang 10 bài, thêm, sửa, ẩn/hiện, xem lịch sử. Logic nằm ở `shared/lesson-service.ts`, `shared/lesson-admin-rules.ts` và `shared/lesson-repo.ts`.

## API
| Phương thức / đường dẫn | Quyền |
|---|---|
| GET /api/me | Khách xem trạng thái; học viên xem tiến độ của mình; quản trị viên và tình nguyện viên nhận thêm đối tượng `account` (vai trò, email, họ tên, cờ buộc đổi mật khẩu) |
| POST /api/auth/login | Công khai; đăng nhập bằng email và mật khẩu, khóa tạm 15 phút sau 5 lần sai (423). Đặt cookie `st_session` |
| POST /api/auth/logout | Đăng xuất phiên hiện tại và xóa cookie |
| POST /api/auth/password | Mọi vai trò đã đăng nhập; đổi mật khẩu (cần mật khẩu hiện tại), đăng xuất các phiên khác |
| POST /api/auth/profile | Mọi vai trò đã đăng nhập; sửa họ tên |
| POST /api/auth/forgot | Công khai; gửi liên kết đặt lại qua email. Phản hồi giống hệt dù email có tồn tại hay không. Tối đa 3 yêu cầu mỗi tài khoản mỗi giờ (vượt giới hạn: không gửi, phản hồi vẫn giống hệt). 503 khi thiếu cấu hình gửi email |
| POST /api/auth/reset | Công khai; đặt mật khẩu mới bằng token trong liên kết. Token hiệu lực 15 phút, dùng một lần; thành công thì đăng xuất mọi phiên của tài khoản. 400 khi token sai, hết hạn hoặc đã dùng |
| GET /api/accounts | Chỉ quản trị viên; danh sách tài khoản tình nguyện viên |
| POST /api/accounts | Chỉ quản trị viên; tạo tài khoản với mật khẩu tạm (201; 409 nếu trùng email) |
| POST /api/accounts/reset | Chỉ quản trị viên; đặt lại mật khẩu tạm, buộc đổi ở lần đăng nhập kế tiếp, đăng xuất phiên cũ |
| POST /api/accounts/status | Chỉ quản trị viên; vô hiệu hóa hoặc kích hoạt lại; vô hiệu hóa đăng xuất phiên cũ |
| POST /api/progress | Người đăng nhập, chỉ tiến độ của chính mình (đồng bộ, hợp nhất theo giá trị lớn nhất) |
| POST /api/progress/complete | Người đăng nhập; ghi nhận hoàn thành một bài, idempotent, không đảo ngược |
| GET /api/progress/son-tra-so | Người đăng nhập; tỷ lệ hoàn thành khóa học của chính mình (401 nếu chưa đăng nhập, 404 nếu sai mã khóa) |
| GET /api/videos | Công khai danh mục video |
| GET /api/video/:lesson | Công khai video bài học, hỗ trợ Range |
| GET /api/dashboard | Chỉ quản trị viên; nhận tham số lọc và trả `report` (chi tiết trong DAC) |
| POST /api/assessment | Chủ website hoặc tình nguyện viên được cấp quyền |
| POST /api/staff | Chỉ chủ website; cấp/thu hồi quyền đánh giá |
| POST /api/upload-video | Chỉ chủ website; đếm byte khi đọc (tối đa 27 MB thân yêu cầu, 25 MB tệp); lưu R2 và gắn vào bài học |

## Quy tắc vận hành
- OWNER_EMAIL là cấu hình phía máy chủ, không đưa vào mã JavaScript trên trình duyệt.
- RESEND_API_KEY, MAIL_FROM, APP_BASE_URL là cấu hình gửi email khôi phục mật khẩu, chỉ đọc từ secret của nền tảng. Khóa không được ghi trong mã, tài liệu, nhật ký hay kết quả kiểm thử.
- Học viên xác định bằng danh tính do lớp xác thực Sites cung cấp. Quản trị viên và tình nguyện viên xác định bằng cookie phiên `st_session` (FR-AUTH). Cấp quyền tình nguyện viên không trao quyền xem toàn bộ dữ liệu.
- Tình nguyện viên chỉ ghi phiếu khi tài khoản hoạt động, có trong `staff`, và không còn cờ buộc đổi mật khẩu (SRS FR-AUTH-10).
- API ghi dữ liệu kiểm tra Origin cùng website và kiểm tra quyền phía máy chủ.
- Tiến độ hợp nhất theo giá trị lớn nhất để tránh mất tiến độ khi hai thiết bị cập nhật xen kẽ; không có chức năng đặt lại tiến độ trực tuyến trong phiên bản này.
- "Hoàn thành" và "tự thực hành" chỉ là tự xác nhận của học viên, không phải bằng chứng năng lực (quy tắc 4.7). Tỷ lệ khóa học tính trên số bài có done = 1.
- Mã học viên gửi kèm khi đồng bộ để từ chối bản cập nhật nhầm tài khoản.
- Nội dung xem công khai; không đưa thông tin cá nhân vào video hoặc tài liệu.
- Thay video hiện tạo một tệp R2 mới; cần bổ sung chính sách dọn tệp cũ nếu vận hành lâu dài.

## Đánh giá
0 = chưa thực hiện được; 1 = cần hướng dẫn từng bước; 2 = cần nhắc; 3 = tự làm đúng; null = chưa đánh giá.
Dashboard đối chiếu trước–sau trên cùng mã học viên, lấy phiếu mới nhất cho từng lần đo và chỉ đưa vào nhóm đủ cả 5 phép đo ở hai lần. Không xem việc đọc bài là bằng chứng đã thành thạo.

## Hiện trạng Phase 1
- Đã có migration `0000`–`0011`. Migration `0010` và `0011` phục vụ quản lý bài học (xem HUONG_DAN mục 7). Migration `0005` chỉ thêm chỉ mục cho báo cáo, không đổi dữ liệu hay bảng. Migration `0006` chỉ tạo bảng `accounts` và `sessions` mới, không đổi dữ liệu cũ.
- Đăng nhập quản trị và tình nguyện viên (FR-AUTH) đã triển khai trong `shared/auth-service.ts`, kiểm thử trong `tests/auth.test.mjs`. Chưa kiểm thử trên Sites (cookie, `Origin`).
- Khôi phục mật khẩu qua email (FR-AUTH-11) đã triển khai trong `shared/password-reset-service.ts`, `shared/password-reset-rules.ts`, `shared/mail-sender.ts`; kiểm thử trong `tests/password-reset.test.mjs` bằng email giả. Có giới hạn 10 yêu cầu mỗi IP mỗi giờ (bảng `request_limits`, migration 0009). Chưa gửi email thật qua Resend vì chưa có tên miền gửi đã xác minh.
- Báo cáo quản trị: `GET /api/dashboard` lọc theo khoảng thời gian, bài, nhóm và kỳ; giao diện `public/admin-report.js`; CSV UTF-8 có BOM. Kiểm thử: `npm test` và kiểm thử trình duyệt 360px (`tests/admin-page-browser.mjs`, chạy thủ công).
- Migration `0000`–`0005` đã áp dụng thử trên D1 cục bộ (Wrangler) không lỗi. Chưa áp dụng trên D1 của bản triển khai Sites.
- Bài kiểm tra trắc nghiệm do máy chủ chấm (`POST /api/quiz/answer`, bảng `quiz_attempts` ở migration `0004`; giới hạn mã bài 0–9 được bỏ ở migration `0011`). Đáp án không có trong `GET /api/lessons`. Dashboard hiển thị số lần làm bài và tỷ lệ đúng, ghi chú là "kiểm tra hiểu bài nội bộ".
- Đã gỡ mã giao diện mẫu shadcn và các phụ thuộc không dùng; tên package là `son-tra-so`.
- Chưa làm: Tailwind biên dịch tĩnh (Phase 2); FR-KEY và Gemini TTS đang **Hoãn** (xem SRS mục 3.6 và DAC D-02).

## Nợ kỹ thuật và giới hạn đã biết
- Đã chuyển sang dịch vụ dùng chung: `shared/dashboard-summary.ts` (khối dashboard cũ), `shared/staff-service.ts` (POST `/api/staff`), `shared/assessment-service.ts` (POST `/api/assessment`).
- Nhóm `lessons` đã chuyển sang `shared/lesson-service.ts` (danh mục bài, trả 503 khi thiếu hoặc hỏng dữ liệu).
- Nhóm xác thực (`role()`, `me()`) đã chuyển sang `shared/identity-service.ts`; kiểm thử trong `tests/identity-service.test.mjs`.
- Giới hạn tải video: `shared/body-limit.ts` đếm byte khi đọc luồng (không tin `Content-Length`), vượt 27 MB thì hủy luồng và trả 413 trước khi đọc hết. Thân yêu cầu được giữ trong bộ nhớ tới mức giới hạn này; chưa phải phân tích multipart theo luồng. Thời lượng video vẫn do client gửi và được tin tưởng.
- Nhóm `upload-video` đã chuyển sang `storeUploadedVideo` trong `shared/video-service.ts`, qua Adapter `VideoStorage` cho R2. Thứ tự: kiểm tra, ghi R2, ghi DB (lỗi thì xóa tệp mới), rồi xóa tệp cũ.
- Nhóm `video-link` đã chuyển vào `shared/video-service.ts` (`replaceWithVideoLink`); route vẫn xóa tệp R2 cũ sau khi ghi DB.
- Nhóm đọc video (`videos`, `video/:lesson`) đã chuyển sang `shared/video-service.ts`; stream R2 vẫn ở route.
- Nhóm `quiz/answer` đã chuyển sang `shared/quiz-service.ts`; điểm kiểm tra đúng ghi qua `recordQuizPass` trong `shared/progress-service.ts` (không còn SQL `progress` trong `route.ts`).
- Nhóm `progress` đã chuyển sang `shared/progress-service.ts` (đồng bộ, hoàn thành bài, tổng hợp khóa học), có kiểm thử hợp nhất `done`/`read` theo giá trị lớn nhất trong `tests/progress-service.test.mjs`.
- Đã hoàn tất tách SQL khỏi `route.ts`: không còn câu lệnh SQL nào trong route. Quyền tình nguyện viên (`role()` gọi `isStaffEmail`) và khởi tạo học viên (`me()` gọi `ensureLearnerCode`) nằm ở `shared/identity-service.ts`; route chỉ đọc header danh tính và cờ quản trị.
- Thẻ tổng quan đầu trang (học viên, phiếu quan sát, phiếu đạt) lấy từ `report` của máy chủ; hàm xuất CSV cũ đã bỏ, khối tự học và phiếu quan sát nằm trong CSV báo cáo và không chịu ảnh hưởng bộ lọc.
- Truy vấn báo cáo chưa đo trên D1 của bản triển khai và chưa có kiểm thử tải đồng thời. Chỉ tiêu NFR-PERF-03 mới đạt trên SQLite trong bộ nhớ.
- FR-DSH-02 (làm mới 15 giây) chưa có kiểm thử đo khoảng thời gian.

## Chính sách migration
- `drizzle/0000_fancy_rogue.sql` là migration gốc, có thể đã áp dụng trên D1. Không đổi tên, không sửa nội dung.
- Migration mới đánh số `0001_`, `0002_`, ... Sinh bằng `drizzle-kit generate`, sau đó đọc SQL trước khi áp dụng.
- Không dùng SQL tạo lại bảng (`CREATE TABLE` mới, `INSERT ... SELECT`, `DROP TABLE`) trừ khi được phê duyệt riêng, để tránh mất khóa ngoại và dữ liệu.
- Sau mỗi migration, chạy `drizzle-kit check` để xác nhận snapshot khớp schema.
- Kiểm thử API (`pnpm test`) phải nạp đủ mọi migration theo thứ tự.

## Công việc tiếp theo
1. Quay và đăng 3–5 video thực tế, bổ sung phụ đề.
2. Kiểm tra đăng nhập, phân quyền, đồng bộ hai thiết bị trên bản triển khai.
3. Thử nghiệm 12–15 người dân và 3–4 tình nguyện viên.
4. Kiểm tra tải, chi phí, sao lưu D1/R2 và quy trình khôi phục trước khi mở rộng.
5. Bổ sung quản lý phiên học, nhật ký thao tác và chính sách lưu/xóa dữ liệu nếu cần vận hành lâu dài.
