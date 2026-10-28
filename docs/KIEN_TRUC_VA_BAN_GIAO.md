# Kiến trúc và bàn giao

## Cấu trúc
| Thư mục/tệp | Vai trò |
|---|---|
| public/home.html | Giao diện học tập, thích ứng điện thoại |
| public/app.js | Nội dung bài học, câu kiểm tra và tiến độ trên thiết bị |
| public/resources.js | Phiếu đánh giá cục bộ, sao lưu/khôi phục, tài liệu hỗ trợ |
| public/online.js | Đăng nhập, đồng bộ API, video và nút đánh dấu hoàn thành trong bài học |
| public/home-polish.css, public/slideshow.js | Giao diện trang chủ (CSS thuần) và slideshow đầu trang |
| shared/ | Quy tắc nghiệp vụ dùng chung (kiểm tra bài học, phiếu, video, tiến độ); được `tsc --strict` kiểm tra |
| public/admin.html, public/admin.js, public/admin-report.js | Điều phối: báo cáo thống kê (bộ lọc, bảng, CSV có BOM), phân quyền, ghi phiếu quan sát và tải video |
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

## API
| Phương thức / đường dẫn | Quyền |
|---|---|
| GET /api/me | Khách xem trạng thái; người đăng nhập xem tiến độ của mình |
| POST /api/progress | Người đăng nhập, chỉ tiến độ của chính mình (đồng bộ, hợp nhất theo giá trị lớn nhất) |
| POST /api/progress/complete | Người đăng nhập; ghi nhận hoàn thành một bài, idempotent, không đảo ngược |
| GET /api/progress/son-tra-so | Người đăng nhập; tỷ lệ hoàn thành khóa học của chính mình (401 nếu chưa đăng nhập, 404 nếu sai mã khóa) |
| GET /api/videos | Công khai danh mục video |
| GET /api/video/:lesson | Công khai video bài học, hỗ trợ Range |
| GET /api/dashboard | Chỉ quản trị viên; nhận tham số lọc và trả `report` (chi tiết trong DAC) |
| POST /api/assessment | Chủ website hoặc tình nguyện viên được cấp quyền |
| POST /api/staff | Chỉ chủ website; cấp/thu hồi quyền đánh giá |
| POST /api/upload-video | Chỉ chủ website; lưu R2 và gắn vào bài học |

## Quy tắc vận hành
- OWNER_EMAIL là cấu hình phía máy chủ, không đưa vào mã JavaScript trên trình duyệt.
- Danh tính phải do lớp xác thực Sites cung cấp. Cấp quyền tình nguyện viên không trao quyền xem toàn bộ dữ liệu.
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
- Đã có migration `0000`–`0005`. Migration `0005` chỉ thêm chỉ mục cho báo cáo, không đổi dữ liệu hay bảng.
- Báo cáo quản trị: `GET /api/dashboard` lọc theo khoảng thời gian, bài, nhóm và kỳ; giao diện `public/admin-report.js`; CSV UTF-8 có BOM. Kiểm thử: `npm test` và kiểm thử trình duyệt 360px (`tests/admin-page-browser.mjs`, chạy thủ công).
- Migration `0000`–`0005` đã áp dụng thử trên D1 cục bộ (Wrangler) không lỗi. Chưa áp dụng trên D1 của bản triển khai Sites.
- Bài kiểm tra trắc nghiệm do máy chủ chấm (`POST /api/quiz/answer`, bảng `quiz_attempts` ở migration `0004`). Đáp án không có trong `GET /api/lessons`. Dashboard hiển thị số lần làm bài và tỷ lệ đúng, ghi chú là "kiểm tra hiểu bài nội bộ".
- Đã gỡ mã giao diện mẫu shadcn và các phụ thuộc không dùng; tên package là `son-tra-so`.
- Chưa làm: Tailwind biên dịch tĩnh (Phase 2); FR-KEY và Gemini TTS đang **Hoãn** (xem SRS mục 3.6 và DAC D-02).

## Nợ kỹ thuật và giới hạn đã biết
- Khối `dashboard` của `route.ts` đã chuyển truy vấn `learners`, `assessments`, `staff` sang `shared/dashboard-summary.ts`. Các handler khác trong `route.ts` (`me`, `progress`, các POST, `staff`, `videos`, `lessons`) vẫn có SQL trực tiếp, vi phạm CLAUDE.md mục 3. Cần chuyển theo từng nhóm, mỗi nhóm một thay đổi.
- Phiếu đạt ≥3/5 và tổng số phiếu lấy từ `report.assessmentTotals` của máy chủ. Hàm xuất CSV cũ đã bỏ; khối tự học và phiếu quan sát nay nằm trong CSV báo cáo, không chịu ảnh hưởng bộ lọc.
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
