# Kiến trúc và bàn giao

## Cấu trúc
| Thư mục/tệp | Vai trò |
|---|---|
| public/home.html | Giao diện học tập, thích ứng điện thoại |
| public/app.js | Nội dung bài học, câu kiểm tra và tiến độ trên thiết bị |
| public/resources.js | Phiếu đánh giá cục bộ, sao lưu/khôi phục, tài liệu hỗ trợ |
| public/online.js | Đăng nhập, đồng bộ API và video trong bài học |
| public/admin.html, public/admin.js | Dashboard, phân quyền, ghi phiếu quan sát và tải video |
| public/print.html, public/qr | Sổ tay, poster, phiếu và mã QR |
| app/api/[...path]/route.ts | API máy chủ, kiểm tra quyền và lưu D1/R2 |
| db/schema.ts | Schema Drizzle |
| drizzle/ | SQL migration, snapshot và nhật ký migration |
| build/, scripts/ | Tích hợp môi trường build và chạy |
| tests/api.test.mjs | Kiểm tra API bằng SQLite trong bộ nhớ |

## Dữ liệu
- learners: khóa danh tính ổn định theo website, mã học viên, ngày tạo.
- progress: mỗi học viên/bài học một bản ghi; đã đọc, tự thực hành, kiểm tra đạt và thời gian cập nhật.
- assessments: phiếu quan sát 5 kỹ năng, lần đo, người đánh giá, thời gian.
- staff: email tài khoản được quyền đánh giá.
- videos: bài học, khóa tệp trong R2, loại video, thời lượng và thời gian cập nhật.

## API
| Phương thức / đường dẫn | Quyền |
|---|---|
| GET /api/me | Khách xem trạng thái; người đăng nhập xem tiến độ của mình |
| POST /api/progress | Người đăng nhập, chỉ tiến độ của chính mình |
| GET /api/videos | Công khai danh mục video |
| GET /api/video/:lesson | Công khai video bài học, hỗ trợ Range |
| GET /api/dashboard | Chỉ chủ website |
| POST /api/assessment | Chủ website hoặc tình nguyện viên được cấp quyền |
| POST /api/staff | Chỉ chủ website; cấp/thu hồi quyền đánh giá |
| POST /api/upload-video | Chỉ chủ website; lưu R2 và gắn vào bài học |

## Quy tắc vận hành
- OWNER_EMAIL là cấu hình phía máy chủ, không đưa vào mã JavaScript trên trình duyệt.
- Danh tính phải do lớp xác thực Sites cung cấp. Cấp quyền tình nguyện viên không trao quyền xem toàn bộ dữ liệu.
- API ghi dữ liệu kiểm tra Origin cùng website và kiểm tra quyền phía máy chủ.
- Tiến độ hợp nhất theo giá trị lớn nhất để tránh mất tiến độ khi hai thiết bị cập nhật xen kẽ; không có chức năng đặt lại tiến độ trực tuyến trong phiên bản này.
- Mã học viên gửi kèm khi đồng bộ để từ chối bản cập nhật nhầm tài khoản.
- Nội dung xem công khai; không đưa thông tin cá nhân vào video hoặc tài liệu.
- Thay video hiện tạo một tệp R2 mới; cần bổ sung chính sách dọn tệp cũ nếu vận hành lâu dài.

## Đánh giá
0 = chưa thực hiện được; 1 = cần hướng dẫn từng bước; 2 = cần nhắc; 3 = tự làm đúng; null = chưa đánh giá.
Dashboard đối chiếu trước–sau trên cùng mã học viên, lấy phiếu mới nhất cho từng lần đo và chỉ đưa vào nhóm đủ cả 5 phép đo ở hai lần. Không xem việc đọc bài là bằng chứng đã thành thạo.

## Công việc tiếp theo
1. Quay và đăng 3–5 video thực tế, bổ sung phụ đề.
2. Kiểm tra đăng nhập, phân quyền, đồng bộ hai thiết bị trên bản triển khai.
3. Thử nghiệm 12–15 người dân và 3–4 tình nguyện viên.
4. Kiểm tra tải, chi phí, sao lưu D1/R2 và quy trình khôi phục trước khi mở rộng.
5. Bổ sung quản lý phiên học, nhật ký thao tác và chính sách lưu/xóa dữ liệu nếu cần vận hành lâu dài.
