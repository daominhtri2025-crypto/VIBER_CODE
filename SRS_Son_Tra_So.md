# Đặc tả yêu cầu phần mềm (SRS) — Sơn Trà Số

| Thông tin | Nội dung |
|---|---|
| Tên sản phẩm | Sơn Trà Số — nền tảng học và thực hành kỹ năng số cơ bản |
| Phiên bản tài liệu | 1.2 (bản nháp để phê duyệt) |
| Ngày lập | 20/10/2026 |
| Cấu trúc tham chiếu | ISO/IEC/IEEE 29148:2018, rút gọn cho dự án quy mô nhỏ |
| Người phê duyệt | [Cần bổ sung: họ tên, chức vụ] |
| Trạng thái | Chờ phê duyệt |

**Quy ước:** mỗi yêu cầu có mã định danh duy nhất (ví dụ `FR-LRN-01`). Mức ưu tiên dùng MoSCoW: **M** (bắt buộc), **S** (nên có), **C** (có thể bổ sung). Mục nào chưa có số liệu hoặc quyết định được đánh dấu `[Cần xác định]`.

---

## Lịch sử phiên bản

| Phiên bản | Ngày | Người thực hiện | Nội dung thay đổi |
|---|---|---|---|
| 1.0 | 20/10/2026 | [Cần bổ sung] | Lập bản nháp từ mã nguồn v4 và đặc tả full-stack |
| 1.1 | 20/10/2026 | [Cần bổ sung] | Thêm quản lý khóa API trong bộ nhớ tạm (FR-KEY, chỉ máy chủ cục bộ); thêm tải lên và ghi âm tệp đọc bài (FR-CNT-10 đến FR-CNT-17); bổ sung NFR-SEC-06 đến NFR-SEC-10; thêm UC-06, UC-07; bổ sung câu hỏi mở 8–10 |
| 1.2 | 29/10/2026 | [Cần bổ sung] | Thêm đăng nhập bằng email và mật khẩu cho quản trị viên và tình nguyện viên (mục 3.7, FR-AUTH-01 đến FR-AUTH-10); cập nhật vai trò xác thực (Mục 2.2); thay FR-ADM-04 và FR-ADM-05 bằng tham chiếu tới FR-AUTH; đổi NFR-SEC-05 sang SameSite=Lax; bổ sung truy vết và câu hỏi mở 11–12 |
| 1.3 | 30/10/2026 | [Cần bổ sung] | Ngoài giai đoạn này: FR-KEY và FR-CNT-10 đến FR-CNT-17 (âm thanh, FR-LRN-09). Thêm mục 3.8 tin tức (FR-NEWS-01 đến FR-NEWS-05) và FR-AUTH-11 khôi phục mật khẩu qua email (liên kết hiệu lực 15 phút, nhà cung cấp gửi email là Resend, gói miễn phí). Thêm bảng `password_reset_tokens` (migration 0008) vào mục 4.1. Ghi nhận quyết định câu hỏi mở 8, 9, 14, 15; sửa ma trận truy vết mục 9.1 theo tình trạng tệp thực tế trong repo. |

---

## 1. Giới thiệu

### 1.1. Mục đích

Tài liệu này xác định yêu cầu chức năng, phi chức năng, dữ liệu, giao diện và tiêu chí nghiệm thu cho Sơn Trà Số. Tài liệu là cơ sở để:

- Thiết kế và triển khai frontend, backend và cơ sở dữ liệu.
- Kiểm thử và nghiệm thu sản phẩm.
- Truy vết yêu cầu đến mã nguồn, kiểm thử và minh chứng trong hồ sơ sáng kiến.

### 1.2. Phạm vi

Sơn Trà Số là ứng dụng web giúp người dân phường Sơn Trà học và thực hành các kỹ năng số cơ bản: điện thoại, giao tiếp số, tìm thông tin, biểu mẫu trực tuyến và an toàn số. Hệ thống gồm:

- **Trang học** cho người học, có bài học, video, âm thanh đọc bài và câu hỏi kiểm tra.
- **Phiếu quan sát** cho tình nguyện viên ghi nhận kết quả thực hành theo ba giai đoạn.
- **Dashboard** cho chủ website theo dõi tiến độ, đối chiếu trước–sau và xuất dữ liệu.
- **Quản trị nội dung** gồm thêm bài học, tải video, tải lên hoặc ghi âm tệp đọc bài, tạo âm thanh bằng TTS, và nhập khóa API trong bộ nhớ tạm (chỉ máy chủ cục bộ).
- **Hai môi trường triển khai:** bản Sites (Cloudflare Workers, D1, R2) và máy chủ cục bộ (Node.js, SQLite).

**Ngoài phạm vi (phiên bản này):**

- Học viên đăng nhập trên máy chủ cục bộ.
- Học offline hoàn toàn trên thiết bị.
- Chấm điểm tự động bằng AI.
- Thanh toán, chứng chỉ có giá trị pháp lý.
- Quản lý nhiều điểm học cùng lúc `[Cần xác định]`.

### 1.3. Định nghĩa và từ viết tắt

| Thuật ngữ | Giải thích |
|---|---|
| Học viên (Người học) | Người dân tham gia khóa học, có mã học viên |
| Tình nguyện viên | Người được cấp quyền ghi phiếu quan sát |
| Chủ website | Tài khoản có email được cấu hình là chủ sở hữu; quyền quản trị cao nhất |
| Phiếu quan sát | Bản ghi đánh giá thao tác thực tế của học viên ở một giai đoạn |
| Giai đoạn | Trước học, sau học, kiểm tra lại |
| Nhiệm vụ | Một trong 5 thao tác được đánh giá: quét QR, gửi ảnh, gửi tài liệu, điền biểu mẫu, nhận diện OTP đáng ngờ |
| Đối chiếu trước–sau | So sánh kết quả của cùng một mã học viên giữa các giai đoạn |
| D1 | Cơ sở dữ liệu SQLite của Cloudflare |
| R2 | Kho lưu trữ tệp của Cloudflare |
| TTS | Chuyển văn bản thành giọng nói (Gemini TTS) — **Hoãn** theo D-02 |
| Idempotent | Gửi lại cùng một yêu cầu không tạo thêm bản ghi trùng |
| Append-only | Chỉ thêm, không sửa hoặc xóa |

### 1.4. Tài liệu tham chiếu

- Đặc tả full-stack: `DAC_TA_Son_Tra_So_fullstack.md`.
- Kiến trúc và bàn giao: `docs/KIEN_TRUC_VA_BAN_GIAO.md`.
- Hướng dẫn máy chủ cục bộ: `server-local/README.md`.
- Kế hoạch 23-KH/BCĐ ngày 21/8/2026 của Ban Chỉ đạo 57 phường Sơn Trà (2026). [Căn cứ hành chính, dùng cho phần hồ sơ sáng kiến].

### 1.5. Tổng quan tài liệu

Mục 2 mô tả bối cảnh và người dùng. Mục 3 liệt kê yêu cầu chức năng. Mục 4 mô tả dữ liệu. Mục 5 mô tả giao diện. Mục 6 là yêu cầu phi chức năng. Mục 7 mô tả ca sử dụng. Mục 8 là tiêu chí nghiệm thu. Mục 9 là truy vết và câu hỏi mở.

---

## 2. Mô tả tổng thể

### 2.1. Bối cảnh

Người dân phường Sơn Trà, đặc biệt người lớn tuổi, cần thực hiện các thủ tục và giao dịch trực tuyến nhưng thiếu kỹ năng cơ bản. Sơn Trà Số bổ trợ việc hướng dẫn trực tiếp tại cộng đồng bằng học liệu ngắn, có thể học lặp lại và có ghi nhận kết quả thực hành.

### 2.2. Vai trò người dùng

| Vai trò | Quyền chính | Xác thực |
|---|---|---|
| Khách | Xem trang chủ, danh sách bài, video công khai | Không cần |
| Học viên | Học bài, làm kiểm tra, xem tiến độ của mình | Đăng nhập qua Sites (bản Sites) |
| Tình nguyện viên | Ghi phiếu quan sát | Email và mật khẩu do quản trị viên cấp (FR-AUTH); email phải nằm trong danh sách được cấp quyền |
| Chủ website | Toàn quyền: dashboard, cấp quyền, đăng video, quản trị bài, quản lý tài khoản | Email và mật khẩu; email là email chủ sở hữu cấu hình phía máy chủ; mật khẩu lần đầu lấy từ `ADMIN_PASSWORD` (FR-AUTH-06) |
| Quản trị cục bộ | Thêm bài, tải video, tạo âm thanh trên máy chủ cục bộ | Mật khẩu đặt qua biến môi trường |

### 2.3. Ràng buộc

- **Kỹ thuật:** chạy trên Cloudflare Workers với D1 và R2; máy chủ cục bộ chạy Node.js 22.13 trở lên không cần cài thêm gói.
- **Nội dung:** tiếng Việt có dấu; không dùng thông tin cá nhân trong video hoặc học liệu.
- **Chi phí:** dịch vụ Gemini TTS theo hạn mức miễn phí `[Cần xác định hạn mức và ngân sách]`.
- **Pháp lý:** chưa có quy trình xác nhận đồng ý xử lý dữ liệu cá nhân `[Cần xác định]`.

### 2.4. Giả định

- Học viên có điện thoại thông minh hoặc máy tính có trình duyệt hiện đại và kết nối Internet, ít nhất ở một lần đăng nhập.
- Tình nguyện viên có tài khoản được lớp xác thực của Sites cấp.
- Người phụ trách có quyền truy cập tài khoản Cloudflare, D1, R2 và khóa Gemini.

### 2.5. Phụ thuộc

- Lớp xác thực và header danh tính của nền tảng Sites.
- Dịch vụ Gemini TTS (`gemini-3.8-flash-tts`).
- Nền tảng YouTube cho video nhúng (qua `youtube-nocookie`).
- Trình duyệt hỗ trợ `MediaRecorder` và ngữ cảnh an toàn (HTTPS hoặc localhost) cho tính năng ghi âm trực tiếp (FR-CNT-13).

---

## 3. Yêu cầu chức năng

### 3.1. Học viên và trang học (FR-LRN)

| Mã | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| FR-LRN-01 | Hiển thị danh sách bài học, 10 bài mỗi trang, có điều hướng trang | M | Chuyển trang đúng; số bài hiển thị khớp tổng số bài |
| FR-LRN-02 | Hiển thị trang bài học gồm: tiêu đề, mô tả, các bước, video (nếu có), âm thanh (nếu có), câu hỏi kiểm tra, bước tiếp theo | M | Mọi trường hiển thị đầy đủ; bài không có video không báo lỗi |
| FR-LRN-03 | Đánh dấu đã đọc và đã thực hành | M | Trạng thái được lưu và hiển thị lại sau khi tải trang |
| FR-LRN-04 | Làm câu hỏi kiểm tra; ghi điểm cao nhất | M | Máy chủ chấm theo đáp án lưu trên máy chủ; đáp án không có trong phản hồi công khai; chỉ chấm khi đã đăng nhập và có kết nối; làm sai không tiết lộ đáp án đúng; điểm không giảm khi làm lại; gửi lại cùng mã lượt không tạo lượt mới (Mục 2 đã duyệt) |
| FR-LRN-05 | Xem tiến độ của chính mình | M | Không hiển thị tiến độ của học viên khác |
| FR-LRN-06 | Đồng bộ tiến độ khi đăng nhập; hợp nhất bằng giá trị lớn nhất từng trường | M | Hai thiết bị cập nhật xen kẽ không làm mất tiến độ |
| FR-LRN-07 | Từ chối đồng bộ nếu mã học viên không khớp tài khoản | M | Trả lỗi 403 hoặc 409 `[Cần thống nhất mã lỗi]` |
| FR-LRN-08 | Phát video bài học, hỗ trợ tua (Range) | M | Trả 206, `Content-Range` đúng |
| FR-LRN-09 | Nghe âm thanh đọc bài | S | Có trình phát; khi không có âm thanh, hiển thị thông báo rõ ràng |
| FR-LRN-10 | Học offline | C | `[Cần xác định]` |

### 3.2. Tình nguyện viên và phiếu quan sát (FR-OBS)

| Mã | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| FR-OBS-01 | Chọn học viên theo mã; chọn giai đoạn; chấm 5 nhiệm vụ | M | Không lưu phiếu khi thiếu mã học viên hoặc giai đoạn |
| FR-OBS-02 | Mỗi tiêu chí chấm 0, 1, 2, 3 hoặc để trống (chưa đánh giá) | M | Ô trống được lưu là `null`, không chuyển thành 0 |
| FR-OBS-03 | Gửi lại khi mất mạng qua hàng đợi phía trình duyệt | M | Phiếu được gửi khi có mạng; không tạo phiếu trùng |
| FR-OBS-04 | Gửi lại cùng `client_id` không tạo bản ghi mới | M | Kiểm thử idempotent đạt |
| FR-OBS-05 | Tình nguyện viên không xem được dashboard tổng hợp | M | API trả 403 cho tình nguyện viên |

### 3.3. Dashboard và báo cáo (FR-DSH)

| Mã | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| FR-DSH-01 | Hiển thị bảng tổng hợp theo học viên và theo bài | M | Số liệu khớp với cơ sở dữ liệu |
| FR-DSH-02 | Tự làm mới mỗi 15 giây khi trang mở | M | Khoảng thời gian làm mới đo được là 15 giây ± 1 giây |
| FR-DSH-03 | Đối chiếu trước–sau trên cùng mã học viên; lấy phiếu mới nhất cho mỗi giai đoạn | M | Chỉ đưa vào nhóm có đủ 5 nhiệm vụ ở cả hai lần đo |
| FR-DSH-04 | Xuất CSV | M | Tệp mở được bằng bảng tính; mã hóa UTF-8 có BOM |
| FR-DSH-05 | Không quy đổi chưa đánh giá thành 0 trong tính tỷ lệ | M | Kiểm thử đơn vị đạt |
| FR-DSH-06 | Không dùng số lượt đọc làm chỉ số năng lực | M | Dashboard không hiển thị "năng lực" từ lượt đọc |
| FR-DSH-07 | Lọc báo cáo theo khoảng thời gian (từ/đến ngày theo giờ Việt Nam), bài, nhóm và kỳ (ngày/tuần). Bổ sung theo kế hoạch báo cáo đã duyệt | M | Tham số sai trả 400; mốc 17:00 UTC là đầu ngày kế tiếp ở Việt Nam; kiểm thử API đạt |

### 3.4. Quản lý quyền và tình nguyện viên (FR-ADM)

| Mã | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| FR-ADM-01 | Cấp quyền tình nguyện viên theo email | M | Email được thêm vào danh sách; có thể kiểm tra quyền ngay |
| FR-ADM-02 | Thu hồi quyền tình nguyện viên | M | Sau khi thu hồi, yêu cầu ghi phiếu bị từ chối |
| FR-ADM-03 | Kiểm tra email hợp lệ trước khi lưu | M | Email sai định dạng bị từ chối |
| FR-ADM-04 | Đăng nhập quản trị bằng email và mật khẩu | M | Xem FR-AUTH-01 và FR-AUTH-03 |
| FR-ADM-05 | Phiên quản trị hết hạn sau 12 giờ (đã xác nhận 2026-10-29, thay cho 8 giờ ở bản 1.1) | M | Xem FR-AUTH-05 |

### 3.5. Quản trị nội dung (FR-CNT)

> **Phạm vi (quyết định 2026-10-30):** FR-CNT-10 đến FR-CNT-17 (âm thanh đọc bài) và FR-LRN-09 **không thuộc giai đoạn này**. Các yêu cầu giữ nguyên để làm sau. Quyết định về ghi âm và phát âm thanh đã ghi tại mục 9.2, câu 8 và 9.

| Mã | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| FR-CNT-01 | Thêm bài học mới; bài được gắn chỉ số tiếp theo | M | Chỉ số tăng liên tục; bài cũ không đổi |
| FR-CNT-02 | Kiểm tra dữ liệu bài học: không có `<` và `>`; nhóm 1–5; ít nhất 2 bước; 2–4 lựa chọn; đáp án hợp lệ | M | Mỗi quy tắc có kiểm thử từ chối |
| FR-CNT-03 | Không có chức năng sửa hoặc xóa bài học | M | API không tồn tại hoặc trả 405 |
| FR-CNT-04 | Tải tệp video MP4 hoặc WebM tối đa 25 MB | M | Tệp quá 25 MB bị từ chối trước khi tải toàn bộ |
| FR-CNT-05 | Dán liên kết video: chỉ https; không có tên người dùng hoặc mật khẩu trong URL; tối đa 500 ký tự | M | Mỗi quy tắc có kiểm thử từ chối |
| FR-CNT-06 | Mỗi bài có đúng một video; đăng video mới thay video cũ | M | Sau khi thay, chỉ còn một bản ghi cho bài |
| FR-CNT-07 | Xếp hàng tạo âm thanh cho bài mới ngay sau khi lưu | S | Trạng thái chuyển `queued` → `running` → `ok` hoặc `error` |
| FR-CNT-08 | Tạo lại âm thanh khi nội dung bài đổi | S | So sánh `audio_hash`; tạo lại khi khác |
| FR-CNT-09 | Nút tạo lại âm thanh trên dashboard | C | Endpoint đã có; giao diện chưa có |
| FR-CNT-10 | Mỗi bài có một nguồn âm thanh cấu hình: `tts`, `upload` hoặc `none` | M | Giá trị ngoài ba lựa chọn bị từ chối |
| FR-CNT-11 | Tải lên tệp âm thanh có sẵn định dạng MP3, M4A, WAV, OGG, tối đa 10 MB | M | Tệp quá 10 MB bị từ chối với mã 413; định dạng khác bị từ chối với mã 415 |
| FR-CNT-12 | Kiểm tra định dạng tệp bằng chữ ký nhị phân (magic bytes) ở phần đầu tệp; không dựa vào đuôi tệp hoặc `Content-Type` do client gửi | M | Tệp `.txt` đổi tên thành `.mp3` bị từ chối |
| FR-CNT-13 | Ghi âm trực tiếp trong dashboard bằng `MediaRecorder`; khi dừng, bản ghi được gửi theo FR-CNT-11 và FR-CNT-12 | S | Ghi và tải lên được trên Chrome và Safari; khi bị từ chối quyền micro, hiển thị thông báo rõ ràng |
| FR-CNT-14 | Chấp nhận định dạng WebM (EBML) chỉ cho bản ghi từ FR-CNT-13 | S | `[Cần xác nhận: Mục 9.2, câu 8]` |
| FR-CNT-15 | Quy tắc phát âm thanh: nguồn `none` thì không phát; có tệp tải lên thì phát tệp; nguồn `tts` thì phát TTS; các trường hợp còn lại không phát | M | Kiểm thử từng trường hợp; `[Cần xác nhận: Mục 9.2, câu 9]` |
| FR-CNT-16 | Mỗi bài chỉ có một tệp tải lên; tệp mới được ghi xong trước khi xóa tệp cũ | M | Sau khi thay, chỉ còn một tệp trên đĩa cho bài đó |
| FR-CNT-17 | Phát tệp âm thanh hỗ trợ tua (Range) | S | Trả 206 với `Content-Range` đúng |

### 3.6. Quản lý khóa API Gemini (FR-KEY) — chỉ máy chủ cục bộ

> **Ngoài giai đoạn này (quyết định 2026-10-30).** Không có máy chủ cục bộ trong repo tại thời điểm này. Mục này giữ nguyên để làm sau khi có quyết định mở rộng.
> **Trạng thái: Hoãn.** Không triển khai trong Phase 1, theo quyết định không dùng Gemini TTS (DAC D-02). Chỉ mở lại khi có quyết định mới.

Khóa API được nhập trực tiếp trên dashboard quản trị của máy chủ cục bộ, chỉ lưu trong bộ nhớ tiến trình. Tính năng này không có trên bản Sites.

| Mã | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| FR-KEY-01 | Ô nhập khóa Gemini trên dashboard quản trị, gửi bằng POST tới máy chủ cục bộ | M | Khóa hợp lệ chuyển giao diện sang trạng thái "Đã kết nối" |
| FR-KEY-02 | Khóa chỉ giữ trong bộ nhớ tiến trình; không ghi đĩa, không ghi cơ sở dữ liệu, không lưu trong `localStorage`, `sessionStorage` hoặc cookie | M | Kiểm thử: sau khi nhập, quét thư mục dữ liệu và SQLite không thấy khóa |
| FR-KEY-03 | Backend không bao giờ trả khóa về trình duyệt, kể cả trong phản hồi lỗi | M | Kiểm thử: không phản hồi nào chứa chuỗi khóa |
| FR-KEY-04 | Giao diện chỉ hiển thị bản che gồm 4 ký tự cuối và trạng thái "Đã kết nối" hoặc "Chưa có khóa" | M | Không hiển thị tiền tố cố định; xem ghi chú bên dưới |
| FR-KEY-05 | Nút "Xóa khóa khỏi bộ nhớ" xóa khóa và cập nhật trạng thái ngay | M | Sau khi xóa, yêu cầu tạo âm thanh TTS bị từ chối với thông báo rõ ràng |
| FR-KEY-06 | Khóa tự mất khi khởi động lại tiến trình máy chủ | M | Kiểm thử khởi động lại: trạng thái trở về "Chưa có khóa" |
| FR-KEY-07 | Khi không có khóa trong bộ nhớ, dùng `GEMINI_API_KEY` làm dự phòng; nếu không có cả hai, tắt TTS | M | Thứ tự ưu tiên: bộ nhớ → biến môi trường → tắt |
| FR-KEY-08 | Bản Sites không có chức năng nhập khóa; khóa trên Sites chỉ đặt qua secret của nền tảng | M | Bản Sites không có endpoint nhận khóa |
| FR-KEY-09 | Kiểm tra đầu vào: từ chối giá trị rỗng, có khoảng trắng hoặc ký tự điều khiển; độ dài tối thiểu 20 ký tự | S | Dữ liệu sai bị từ chối với mã 400 |

**Ghi chú về bản che:** không kiểm tra hay hiển thị tiền tố của khóa (ví dụ `AIza`), vì định dạng có thể thay đổi và tiền tố làm lộ loại khóa. Chỉ hiển thị 4 ký tự cuối.

---

### 3.7. Đăng nhập, phiên và tài khoản (FR-AUTH)

Áp dụng cho quản trị viên (chủ website) và tình nguyện viên trên cả hai môi trường. Mục này thay thế cách xác thực cũ bằng mật khẩu chung và bằng header của Sites đối với hai vai trò này. Học viên vẫn xác định bằng header danh tính của nền tảng Sites (xem Mục 2.5).

| Mã | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| FR-AUTH-01 | Quản trị viên và tình nguyện viên đăng nhập bằng email và mật khẩu; trang điều phối chỉ hiển thị nội dung sau khi đăng nhập | M | Sai email hoặc mật khẩu trả cùng một thông báo chung (401), không tiết lộ email có tồn tại hay không |
| FR-AUTH-02 | Chính sách mật khẩu khi tạo, đặt lại và đổi: từ 10 đến 200 ký tự. Khi đăng nhập không kiểm tra độ dài để không lộ chính sách cho người thử đoán | M | Mật khẩu 9 ký tự bị từ chối ở các thao tác tạo, đặt lại và đổi |
| FR-AUTH-03 | Sau 5 lần đăng nhập sai liên tiếp của một tài khoản, khóa tạm 15 phút | M | Yêu cầu trong thời gian khóa trả 423 kèm thời gian chờ; sau khi hết hạn khóa, đăng nhập đúng thì thành công |
| FR-AUTH-04 | Mật khẩu chỉ lưu dạng băm PBKDF2-SHA256 (100 000 vòng, muối ngẫu nhiên); mã phiên chỉ lưu dạng băm SHA-256 | M | Quét cơ sở dữ liệu không thấy mật khẩu hoặc mã phiên dạng rõ |
| FR-AUTH-05 | Cookie phiên `st_session` có HttpOnly, Secure, SameSite=Lax; phiên hết hạn sau 12 giờ kể từ khi đăng nhập (đã xác nhận 2026-10-29) | M | Phiên quá hạn bị từ chối; JavaScript không đọc được cookie |
| FR-AUTH-06 | Tài khoản quản trị (chủ website) được tạo từ biến môi trường `ADMIN_PASSWORD` ở lần đăng nhập đầu tiên duy nhất; sau đó mật khẩu chỉ còn dạng băm và được đổi trong trang tài khoản. Mã nguồn và tài liệu không chứa giá trị mặc định (đã xác nhận 2026-10-29, Mục 9.2, câu 11) | M | Không có mật khẩu trong mã nguồn, tài liệu, nhật ký; đổi `ADMIN_PASSWORD` sau khi tài khoản đã tồn tại không đổi mật khẩu |
| FR-AUTH-07 | Quản trị viên tạo tài khoản tình nguyện viên với mật khẩu tạm; tài khoản phải đổi mật khẩu ở lần đăng nhập kế tiếp trước khi dùng chức năng khác | M | Khi cờ buộc đổi còn bật, mọi API nghiệp vụ trả 403 và giao diện chỉ mở mục tài khoản của chính mình |
| FR-AUTH-08 | Quản trị viên đặt lại mật khẩu tạm hoặc vô hiệu hóa tài khoản; thao tác này đăng xuất mọi phiên của tài khoản đó | M | Phiên cũ bị từ chối ngay sau khi đặt lại hoặc vô hiệu hóa |
| FR-AUTH-09 | Mọi vai trò tự đổi mật khẩu (cần mật khẩu hiện tại) và tự sửa họ tên; đổi mật khẩu đăng xuất các phiên khác | M | Sai mật khẩu hiện tại bị từ chối; phiên khác mất hiệu lực |
| FR-AUTH-10 | Tình nguyện viên chỉ ghi phiếu quan sát khi tài khoản đang hoạt động, email nằm trong danh sách được cấp quyền và không còn cờ buộc đổi mật khẩu; không xem dashboard tổng hợp và không quản lý tài khoản | M | Kiểm thử riêng từng trường hợp: tài khoản bị vô hiệu hóa, chưa được cấp quyền, còn cờ buộc đổi đều bị từ chối ghi phiếu |

---

| FR-AUTH-11 | Khôi phục mật khẩu quản trị viên và tình nguyện viên qua email. Người dùng nhập email; hệ thống gửi email chứa liên kết có token bảo mật qua Resend (gói miễn phí: 3 000 email mỗi tháng, 100 email mỗi ngày, 3 tên miền gửi). Liên kết chỉ có hiệu lực trong 15 phút kể từ khi gửi, dùng được một lần; quá hạn hoặc đã dùng thì vô hiệu hóa. Khi có yêu cầu mới, mọi token chưa dùng của cùng tài khoản bị vô hiệu hóa. Token là chuỗi ngẫu nhiên 256 bit, chỉ lưu dạng băm SHA-256. Khi đặt lại thành công, mọi phiên của tài khoản bị đăng xuất. Khóa API gửi email chỉ đặt qua secret của nền tảng, không ghi trong mã | M | Token quá 15 phút bị từ chối; token dùng lần hai bị từ chối; yêu cầu với email không tồn tại trả cùng thông báo như email có tồn tại; cơ sở dữ liệu không chứa token dạng rõ. Giới hạn đã quyết định (30/10/2026): tối đa 3 yêu cầu mỗi tài khoản trong 60 phút; yêu cầu vượt giới hạn không gửi thư, phản hồi vẫn giống hệt. Tối đa 10 yêu cầu mỗi IP mỗi giờ (IP lấy từ `CF-Connecting-IP`, lưu dưới dạng băm, migration 0009); vượt giới hạn trả 429. `[Cần xác định: tên miền gửi đã xác minh của chủ website]` |

### 3.8. Tin tức trang chủ (FR-NEWS)

Áp dụng từ giai đoạn này. Quyết định 2026-10-30: tin đăng tay là nguồn chính; tự động cào dữ liệu chỉ bổ sung khi đủ điều kiện ghi ở FR-NEWS-03.

| Mã | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| FR-NEWS-01 | Quản trị viên đăng, sửa và ẩn hoặc hiện tin tức trong trang quản trị. Tình nguyện viên và khách không có quyền này | M | Tình nguyện viên nhận 403; khách nhận 401; API ghi kiểm tra Origin |
| FR-NEWS-02 | Mỗi tin có tiêu đề bắt buộc; tóm tắt tối đa 500 ký tự; nội dung tối đa 5 000 ký tự; liên kết nguồn không bắt buộc, chỉ nhận https, không chứa thông tin đăng nhập, tối đa 500 ký tự | M | Mỗi giới hạn có kiểm thử từ chối; ràng buộc cũng nằm ở cơ sở dữ liệu |
| FR-NEWS-03 | Tự động lấy tin từ `https://sontra.danang.gov.vn/`. Chỉ thực hiện khi (a) nguồn cho phép truy cập tự động theo `robots.txt` và điều khoản sử dụng, và (b) chủ website xác nhận bằng văn bản. Trạng thái hiện tại: **chưa thực hiện**. Công cụ kiểm tra của dự án không đọc được `robots.txt` của nguồn (bị chặn theo chính sách của trang, ngày 30/10/2026) | S | Không gửi yêu cầu tự động khi chưa đủ hai điều kiện trên; mỗi tin tự động có liên kết nguồn |
| FR-NEWS-04 | Trang chủ chỉ hiển thị tin chưa ẩn, mới nhất trước, tối đa 20 tin. Tin ẩn không rời máy chủ qua đường công khai | M | Kiểm thử: tin ẩn không xuất hiện trong `GET /api/news` |
| FR-NEWS-05 | Mỗi tin ghi rõ nguồn khi có (tên nguồn và liên kết https). Nội dung do ban quản lý viết lại hoặc tóm tắt; không sao chép nguyên văn nội dung từ nguồn bên ngoài | M | Tin có nguồn hiển thị liên kết mở tab mới với `rel="noopener noreferrer"` |

## 4. Yêu cầu dữ liệu

### 4.1. Thực thể và quan hệ

- `learners` (1) — (n) `progress`
- `learners` (1) — (n) `assessments`
- `lessons` (1) — (0..1) `videos`
- `staff` độc lập, lưu email tình nguyện viên.
- `accounts` (1) — (n) `password_reset_tokens` (migration 0008, FR-AUTH-11).

**Bảng `password_reset_tokens` (migration `0008_dat_lai_mat_khau.sql`):**

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | text | khóa chính | Mã bản ghi, sinh ngẫu nhiên |
| `account_id` | text | khóa ngoại tới `accounts(id)`, `ON DELETE CASCADE` | Tài khoản được đặt lại |
| `token_hash` | text | duy nhất, không rỗng | Băm SHA-256 của token gửi qua email; không lưu token dạng rõ |
| `created` | text | ISO 8601 UTC | Thời điểm gửi |
| `expires_at` | text | ISO 8601 UTC, `created` + 15 phút | Hết hạn |
| `used_at` | text, có thể rỗng | ISO 8601 UTC | Điền khi token được dùng hoặc bị vô hiệu hóa |

- Chỉ mục: `password_reset_tokens_account_idx` trên `account_id`.
- **Tác động dữ liệu:** chỉ thêm bảng mới, rỗng khi áp dụng. Không sửa bảng `accounts`, `sessions` hay dữ liệu hiện có.
- **Khôi phục:** `DROP TABLE password_reset_tokens;` (không ảnh hưởng tài khoản hay phiên).
- **Bảo mật:** bản ghi token không chứa mật khẩu. Mật khẩu mới chỉ lưu băm PBKDF2-SHA256 như FR-AUTH-04.

### 4.2. Yêu cầu toàn vẹn

| Mã | Yêu cầu |
|---|---|
| DR-01 | `progress` có khóa chính `(learner, lesson)` |
| DR-02 | `assessments` có khóa duy nhất `(learner, client_id)` |
| DR-03 | `videos.kind` nhận một trong hai giá trị `file` hoặc `link` |
| DR-04 | Khóa ngoại được bật trên mọi kết nối |
| DR-05 | Migration theo thứ tự đánh số, không sửa migration đã áp dụng |
| DR-06 | Mọi thời điểm lưu theo định dạng ISO 8601 UTC |
| DR-07 | Bảng `lessons` có cột `audio_source` (`tts`, `upload`, `none`) và `audio_upload_file` (tên tệp, không phải nội dung); tệp âm thanh lưu ngoài cơ sở dữ liệu |
| DR-08 | Khóa API không xuất hiện trong bất kỳ bảng, cột, tệp hay bản ghi nào |

### 4.3. Lưu trữ và sao lưu

- Video lưu trong R2 hoặc thư mục `videos/` trên máy chủ cục bộ.
- Sao lưu D1 và R2 định kỳ `[Cần xác định tần suất]`; có thử nghiệm khôi phục.
- Chính sách lưu và xóa dữ liệu cá nhân `[Cần xác định]`.

### 4.4. Dữ liệu cá nhân

- Dữ liệu tối thiểu: mã học viên, tiến độ, phiếu quan sát, email tình nguyện viên.
- Không lưu họ tên, số điện thoại, số CCCD trong hệ thống hiện tại. Nếu cần, phải có văn bản đồng ý và đánh giá rủi ro trước khi bổ sung.
- Không đưa thông tin cá nhân vào video hoặc tài liệu học.

---

## 5. Yêu cầu giao diện

### 5.1. Giao diện người dùng

- **Trang chủ:** giới thiệu, nút vào học, hướng dẫn tổng quan.
- **Danh sách bài:** thẻ bài, trạng thái, phân trang.
- **Trang bài:** nội dung học, video, âm thanh, kiểm tra.
- **Phiếu quan sát:** chọn học viên, giai đoạn, chấm điểm, lưu.
- **Dashboard:** bảng, bộ lọc, xuất CSV.
- **Quản trị:** form bài, form video, form liên kết, danh sách tình nguyện viên, trạng thái âm thanh.

Mọi màn hình có ba trạng thái: đang tải, rỗng, lỗi, và thành công.

### 5.2. Giao diện lập trình (API)

Các endpoint được liệt kê trong `DAC_TA_Son_Tra_So_fullstack.md`, Mục 5. Quy ước:

- Đường dẫn bắt đầu bằng `/api`.
- JSON cho mọi phản hồi; lỗi có trường `error` bằng tiếng Việt.
- Mã HTTP: 200 thành công, 201 khi tạo mới, 202 khi xếp hàng, 400 dữ liệu sai, 401 chưa đăng nhập, 403 không đủ quyền hoặc sai origin, 404 không tồn tại, 409 xung đột, 413 tệp quá lớn, 429 quá nhiều yêu cầu, 500 lỗi máy chủ.

### 5.3. Giao diện phần cứng và phần mềm

- **Trình duyệt:** phiên bản hiện hành của Chrome, Edge, Safari, Firefox trên Android và iOS.
- **Thiết bị:** màn hình từ 360 px trở lên.
- **Máy chủ cục bộ:** Windows 10 trở lên hoặc Linux; Node.js 22.13 trở lên. ffmpeg không bắt buộc.

---

## 6. Yêu cầu phi chức năng

| Mã | Nhóm | Yêu cầu | Chỉ tiêu |
|---|---|---|---|
| NFR-PERF-01 | Hiệu năng | Trang học tải lần đầu trên mạng 4G | `[Cần xác định, đề xuất ≤ 3 giây]` |
| NFR-PERF-02 | Hiệu năng | API đọc danh sách bài | `[Cần xác định]` |
| NFR-PERF-03 | Hiệu năng | Dashboard báo cáo với 500 học viên đồng thời | Phản hồi API `/api/dashboard` dưới 1 giây (chỉ tiêu đã duyệt). Đo hiện tại: 14 ms cho 500 học viên và 10.000 lượt làm trên SQLite trong bộ nhớ; chưa đo trên D1 và chưa kiểm tải đồng thời |
| NFR-SEC-01 | Bảo mật | Không có bí mật trong mã nguồn hoặc tệp được commit | Quét bằng công cụ trước mỗi phát hành |
| NFR-SEC-02 | Bảo mật | Chống giả mạo danh tính qua header | Kiểm thử đạt |
| NFR-SEC-03 | Bảo mật | Kiểm tra `Origin` trên mọi yêu cầu ghi | Kiểm thử đạt |
| NFR-SEC-04 | Bảo mật | Thông báo lỗi không chứa khóa, stack trace | Kiểm thử đạt |
| NFR-SEC-05 | Bảo mật | Cookie phiên: HttpOnly, Secure, SameSite=Lax (bản 1.2 đổi từ Strict; xem FR-AUTH-05) | Kiểm thử đạt trên máy chủ; kiểm thử trên Sites `[Cần xác minh]` |
| NFR-SEC-06 | Bảo mật | Khóa API chỉ tồn tại trong bộ nhớ tiến trình cục bộ; không ghi ra đĩa, cơ sở dữ liệu, bộ nhớ trình duyệt, cookie hoặc nhật ký | Rà soát mã và kiểm thử quét đĩa |
| NFR-SEC-07 | Bảo mật | Mọi thông báo lỗi và nhật ký che khóa và chuỗi giống khóa (thay bằng `[đã ẩn]`) | Kiểm thử đạt |
| NFR-SEC-08 | Bảo mật | Tệp tải lên: đếm kích thước khi nhận luồng, dừng ở 10 MB; kiểm tra chữ ký; tên tệp trên đĩa do máy chủ tạo | Kiểm thử đạt |
| NFR-SEC-09 | Bảo mật | Tệp âm thanh phục vụ với `Content-Type` lấy từ chữ ký và kèm `X-Content-Type-Options: nosniff` | Kiểm thử đạt |
| NFR-SEC-10 | Bảo mật | Endpoint nhập khóa và tải lên yêu cầu phiên quản trị, kiểm tra `Origin` và giới hạn tốc độ | Kiểm thử đạt |
| NFR-A11Y-01 | Khả năng tiếp cận | Đạt WCAG 2.1 mức AA | Kiểm tra bằng công cụ và thủ công |
| NFR-A11Y-02 | Khả năng tiếp cận | Nút tối thiểu 44×44 px; cỡ chữ mặc định lớn | Kiểm tra trên thiết bị thật |
| NFR-USE-01 | Sử dụng | Giao diện dùng được ở 360 px, không cuộn ngang | Kiểm tra trình duyệt |
| NFR-USE-02 | Sử dụng | Người học hoàn thành một bài đầu tiên không cần hướng dẫn | `[Cần xác định qua thử nghiệm]` |
| NFR-REL-01 | Tin cậy | Dữ liệu tiến độ không mất khi hai thiết bị cập nhật xen kẽ | Kiểm thử đạt |
| NFR-REL-02 | Tin cậy | Khởi động lại máy chủ cục bộ không mất dữ liệu | Kiểm thử đạt |
| NFR-MNT-01 | Bảo trì | Mọi logic nghiệp vụ nằm trong module dùng chung | Đánh giá khi review |
| NFR-MNT-02 | Bảo trì | Độ bao phủ kiểm thử module nghiệp vụ | `[Cần xác định, đề xuất ≥ 80%]` |
| NFR-TST-01 | Kiểm thử | `npm test` chạy xanh trên máy sạch | Bắt buộc |
| NFR-LOC-01 | Ngôn ngữ | Giao diện và thông báo bằng tiếng Việt có dấu | Kiểm tra thủ công |

---

## 7. Ca sử dụng chính

### UC-01. Học viên học một bài

1. Học viên mở danh sách bài, chọn một bài.
2. Hệ thống hiển thị nội dung, video (nếu có).
3. Học viên đánh dấu đã đọc và đã thực hành.
4. Học viên làm câu hỏi kiểm tra; hệ thống ghi điểm.
5. Khi đăng nhập, tiến độ được đồng bộ.

**Ngoại lệ:** mất mạng → tiến độ lưu tạm trên thiết bị và gửi khi có mạng `[Cần xác định cơ chế với tiến độ]`.

### UC-02. Tình nguyện viên ghi phiếu trước học

1. Tình nguyện viên đăng nhập; hệ thống kiểm tra email trong danh sách được cấp quyền.
2. Tình nguyện viên nhập mã học viên.
3. Tình nguyện viên chọn giai đoạn "trước học" và chấm 5 nhiệm vụ; ô không quan sát được để trống.
4. Tình nguyện viên lưu phiếu.

**Ngoại lệ:** mất mạng → phiếu nằm trong hàng đợi và được gửi lại; `client_id` ngăn trùng.

### UC-03. Chủ website đối chiếu trước–sau

1. Chủ website mở dashboard.
2. Hệ thống tự làm mới mỗi 15 giây.
3. Chủ website lọc theo nhóm; hệ thống hiển thị số người đủ 5 nhiệm vụ ở cả hai lần đo.
4. Chủ website xuất CSV.

### UC-04. Quản trị thêm bài và âm thanh

1. Quản trị viên nhập tiêu đề, nhóm, nội dung, câu hỏi, đáp án, bước tiếp theo.
2. Hệ thống kiểm tra dữ liệu; nếu hợp lệ, thêm bài với chỉ số tiếp theo.
3. Quản trị viên chọn nguồn âm thanh của bài (`tts`, `upload` hoặc `none`). Nếu nguồn là `tts` và có khóa (trong bộ nhớ hoặc biến môi trường), hệ thống xếp hàng tạo âm thanh; giao diện hiển thị trạng thái.
4. Nếu quản trị viên chọn tải lên hoặc ghi âm, luồng chuyển sang UC-07.

### UC-05. Chủ website đăng video

1. Chủ website chọn bài, tải tệp hoặc dán liên kết.
2. Hệ thống kiểm tra kích thước, kiểu tệp hoặc định dạng URL.
3. Video được gắn vào bài; video cũ (nếu có) được thay.

---

### UC-06. Quản trị viên nhập và xóa khóa API (máy chủ cục bộ)

1. Quản trị viên mở dashboard, nhập khóa vào ô được che và bấm "Lưu vào bộ nhớ".
2. Hệ thống kiểm tra đầu vào (FR-KEY-09), giữ khóa trong bộ nhớ và trả về bản che cùng trạng thái "Đã kết nối".
3. Giao diện xóa nội dung trường nhập ngay sau khi gửi.
4. Khi cần, quản trị viên bấm "Xóa khóa khỏi bộ nhớ"; hệ thống xóa khóa và hiển thị "Chưa có khóa".

**Ngoại lệ:** máy chủ khởi động lại → khóa mất; quản trị viên nhập lại hoặc dùng `GEMINI_API_KEY` (FR-KEY-06, FR-KEY-07).

### UC-07. Quản trị viên tải lên hoặc ghi âm tệp đọc bài

1. Quản trị viên chọn bài và chọn nguồn `upload`.
2. Quản trị viên chọn tệp từ máy hoặc bấm "Ghi âm"; khi ghi âm, bấm dừng và nghe lại bản ghi.
3. Quản trị viên bấm "Lưu âm thanh".
4. Hệ thống đếm kích thước khi nhận, kiểm tra chữ ký, ghi tệp rồi cập nhật bản ghi; giao diện hiển thị tên tệp và trình phát.

**Ngoại lệ:**
- Sai định dạng → mã 415, thông báo "Tệp không đúng định dạng âm thanh được hỗ trợ".
- Quá 10 MB → mã 413; tệp tạm bị xóa, tệp cũ của bài (nếu có) vẫn giữ.
- Không có quyền micro → thông báo, không tạo bản ghi.

---

## 8. Tiêu chí nghiệm thu

1. Mọi yêu cầu mức M có ít nhất một kiểm thử tự động hoặc một bước kiểm tra thủ công được ghi lại.
2. `npm test` xanh trên bản build sạch.
3. Ca sử dụng UC-01 đến UC-05 chạy được trên bản Sites và trên máy chủ cục bộ.
4. Kiểm tra bảo mật: không có bí mật trong mã; API ghi từ origin khác bị chặn; header giả không được chấp nhận.
5. Kiểm tra trên điện thoại thật ở 360 px.
6. Biên bản nghiệm thu có chữ ký của người phụ trách `[Cần bổ sung]`.

---

## 9. Truy vết và câu hỏi mở

### 9.1. Ma trận truy vết (rút gọn)

| Yêu cầu | Mã nguồn | Kiểm thử | Minh chứng |
|---|---|---|---|
| FR-LRN-06 | `public/online.js`, `route.ts` (`/api/progress`) | `client-progress.test.mjs`, `api.test.mjs` | Cần kiểm chứng: tệp tham chiếu không có trong repo (30/10/2026) |
| FR-OBS-04 | `route.ts` (`/api/assessment`), `schema.ts` | `api.test.mjs` | Ghi trong hồ sơ |
| FR-DSH-01, FR-DSH-05 | `shared/dashboard-rules.ts`, `shared/dashboard-queries.ts`, `route.ts` (`/api/dashboard`) | `dashboard-rules.test.mjs`, `dashboard-queries.test.mjs`, `dashboard-api.test.mjs` | Tự động: npm test đạt |
| FR-DSH-02 | `public/admin-report.js`, `public/admin.js` (chu kỳ 15 000 ms) | Chưa có | Chưa kiểm chứng: chưa đo khoảng thời gian làm mới |
| FR-DSH-03 | `shared/dashboard-rules.ts` (`pairPrePost`), `route.ts` (`/api/dashboard`) | `dashboard-rules.test.mjs`, `dashboard-queries.test.mjs` | Tự động: npm test đạt |
| FR-DSH-04 | `public/admin-report.js` (CSV có BOM) | `admin-page.test.mjs`, `admin-page-browser.mjs` (chạy thủ công) | Tự động và trình duyệt 360px: đạt |
| FR-DSH-07, FR-OBS-05 | `route.ts` (`/api/dashboard`), `shared/dashboard-queries.ts` | `dashboard-api.test.mjs` | Tự động: npm test đạt |
| NFR-PERF-03 | `shared/dashboard-queries.ts` | `dashboard-queries.test.mjs` (500 học viên, 10.000 lượt) | Đạt trên SQLite; chưa đo trên D1 |
| FR-CNT-02 | `server-local/server.mjs` | `local-server.test.mjs` | Cần kiểm chứng: tệp tham chiếu không có trong repo (30/10/2026) |
| FR-CNT-05 | `route.ts` (`/api/video-link`) | `local-server.test.mjs` | Cần kiểm chứng: tệp tham chiếu không có trong repo (30/10/2026) |
| FR-CNT-07 | `server-local/narration.mjs` | `narration.test.mjs` | Cần kiểm chứng: tệp tham chiếu không có trong repo (30/10/2026) |
| FR-ADM-04 | `server-local/server.mjs` | `local-server.test.mjs` | Cần kiểm chứng: tệp tham chiếu không có trong repo (30/10/2026) |
| FR-KEY-02, FR-KEY-03 | `server-local/` (dự kiến) | Chưa có | Ngoài giai đoạn này (30/10/2026) |
| FR-CNT-10 đến FR-CNT-17 | Chưa có | Chưa có | Ngoài giai đoạn này (30/10/2026) |
| FR-AUTH-01 đến FR-AUTH-10 | `shared/auth-service.ts`, `shared/auth-rules.ts`, `shared/password-hash.ts`, `app/api/[...path]/route.ts` | `tests/auth.test.mjs` (qua `npm test`) | Tự động: npm test đạt trên SQLite; chưa kiểm thử trên Sites (cookie, Origin) |
| FR-AUTH-03, FR-AUTH-07 đến FR-AUTH-10 (giao diện) | `public/admin.js`, `public/admin.html` | `tests/admin-page-browser.mjs` (chỉ kiểm thử trang đã đăng nhập) | Chưa kiểm chứng luồng màn hình đăng nhập và đổi mật khẩu bắt buộc trên trình duyệt |

| FR-AUTH-11 | `shared/password-reset-*.ts`, `shared/mail-sender.ts`, `app/api/[...path]/route.ts`, `public/admin.js` | `tests/password-reset.test.mjs` (email giả) | Tự động: npm test đạt (30/10/2026), gồm giới hạn theo IP (429). Gửi email thật qua Resend chưa kiểm chứng: chưa có tên miền gửi đã xác minh |
| FR-NEWS-01, FR-NEWS-02, FR-NEWS-04, FR-NEWS-05 | `shared/news-*.ts`, `app/api/[...path]/route.ts` | `tests/news.test.mjs` | Tự động: npm test đạt (30/10/2026) |
| FR-NEWS-03 | Chưa có | Chưa có | Chưa thực hiện: nguồn chưa cho phép truy cập tự động (30/10/2026) |

Cột "Minh chứng" cần cập nhật sau khi có ảnh chụp màn hình hoặc biên bản nghiệm thu.

### 9.2. Câu hỏi mở

1. Học viên có cần đăng nhập ngoài nền tảng Sites không?
2. Bản Sites có đọc bài học từ cơ sở dữ liệu không, và đồng bộ thế nào với bản cục bộ?
3. Thời gian lưu dữ liệu cá nhân và quy trình xóa theo yêu cầu?
4. Ngưỡng hiệu năng và độ bao phủ kiểm thử?
5. Có cần phụ đề cho video không?
6. Cơ chế xử lý tiến độ khi mất mạng ở bản học (không chỉ phiếu quan sát)?
7. Ai là người phê duyệt tài liệu và nghiệm thu?
8. **Ghi âm WebM** — **QUYẾT ĐỊNH (2026-10-30), áp dụng khi triển khai âm thanh:** chấp nhận WebM cho ghi âm trực tiếp và cho tệp ghi âm được đẩy lên. `[Cần xác nhận: "đẩy file ghi âm lên" nghĩa là tệp WebM tải lên từ máy, hay chỉ tệp MP3/M4A/WAV/OGG]`. Nội dung gốc câu hỏi: Chrome thường xuất WebM khi ghi âm trực tiếp, trong khi danh sách tải lên không có WebM. Chọn một trong ba: (a) chấp nhận WebM chỉ cho ghi âm trực tiếp (khuyến nghị), (b) chuyển WebM sang MP3 phía máy chủ bằng ffmpeg khi có, (c) chỉ cho tải tệp có sẵn, bỏ FR-CNT-13.
9. **Nguồn `none` và tệp tải lên** — **QUYẾT ĐỊNH (2026-10-30), áp dụng khi triển khai âm thanh:** tệp âm thanh chỉ được phát khi học viên chủ động yêu cầu phát, không tự phát. `[Cần xác nhận: hành vi này có thay FR-CNT-15 không, vì FR-CNT-15 hiện ghi nguồn none thì không phát]`. Nội dung gốc câu hỏi: khi nguồn được đặt là `none` nhưng vẫn có tệp đã tải lên, theo FR-CNT-15 bản này không phát. Xác nhận hành vi này, hoặc đổi thành "tệp tải lên luôn được phát".
10. **Nguồn `tts` và tệp tải lên — ĐÃ QUYẾT ĐỊNH (2026-10-29):** tệp tải lên được ưu tiên hơn TTS. Khi bài không có tệp tải lên, TTS đóng vai trò dự phòng. Áp dụng cho FR-CNT-15 và Mục 4.10 của CLAUDE.md.
11. **Mật khẩu quản trị lần đầu (FR-AUTH-06) — ĐÃ QUYẾT ĐỊNH (2026-10-29):** hệ thống không có mật khẩu mặc định trong mã. Chủ website đặt `ADMIN_PASSWORD` làm bí mật trên môi trường trước lần đăng nhập đầu, đăng nhập ngay và đổi mật khẩu trong trang tài khoản. Lưu ý: trước lần đăng nhập đầu chưa có tài khoản nên khóa 5 lần sai (FR-AUTH-03) chưa áp dụng; giá trị `ADMIN_PASSWORD` cần đủ mạnh.
12. **Thời hạn phiên và cookie:** thời hạn phiên 12 giờ — ĐÃ QUYẾT ĐỊNH (2026-10-29), thay cho 8 giờ ở FR-ADM-05 bản 1.1. Thuộc tính cookie SameSite vẫn chờ quyết định: mã dùng `Lax`, NFR-SEC-05 bản 1.1 ghi `Strict`. `[Cần xác nhận: Lax hay Strict]`.
13. **Đường dẫn không có đuôi `.html` trên Sites — ĐÃ XÁC NHẬN (2026-10-29):** người phụ trách xác nhận đường dẫn `/admin` truy cập được trang quản trị trên Sites. Việc đổi liên kết nội bộ (README, `app/page.tsx`, `online.js`, tài liệu) là thay đổi nhiều tệp, chưa thực hiện, cần phê duyệt riêng.
14. **Phạm vi giai đoạn này — ĐÃ QUYẾT ĐỊNH (2026-10-30):** không triển khai FR-KEY và FR-CNT-10 đến FR-CNT-17 trong giai đoạn này.
15. **Tin tức tự động và khôi phục mật khẩu — ĐÃ QUYẾT ĐỊNH (2026-10-30):** (a) tin đăng tay kết hợp liên kết đến `https://sontra.danang.gov.vn/`; tự động cào chỉ bổ sung khi đủ điều kiện FR-NEWS-03. (b) Khôi phục mật khẩu qua email với liên kết có token bảo mật, hiệu lực 15 phút, dùng một lần (FR-AUTH-11). **Cập nhật cùng ngày:** chủ website đồng ý tăng thời hạn từ 5 lên 10–15 phút; dự án chọn 15 phút. Nhà cung cấp gửi email là Resend, gói miễn phí. Thay đổi schema được chủ website đồng ý, ghi tại mục 4.1 (migration 0008). `[Cần xác định: tên miền gửi đã xác minh]`.
