# Đặc tả kỹ thuật full-stack — Sơn Trà Số

| Thông tin | Nội dung |
|---|---|
| Tên tài liệu | Đặc tả kỹ thuật full-stack (kiến trúc, API, dữ liệu, quy tắc nghiệp vụ) |
| Phiên bản | 0.1 (bản nháp để phê duyệt) |
| Ngày lập | 20/10/2026 |
| Tham chiếu | `SRS_Son_Tra_So.md` v1.1; `CLAUDE.md`; `docs/KIEN_TRUC_VA_BAN_GIAO.md` |
| Người phê duyệt | [Cần bổ sung: họ tên, chức vụ] |
| Trạng thái | Chờ phê duyệt |

**Quy ước:**
- `[Cần xác định]`: chưa có quyết định.
- `[Cần xác minh với mã v4]`: thông tin lấy từ SRS, chưa đối chiếu được với mã nguồn vì mã v4 chưa có trên nhánh `Son_tra_so` (xem `docs/KIEN_TRUC_VA_BAN_GIAO.md`).
- `[Dự kiến]`: API hoặc module đề xuất mới, chưa được phê duyệt.

---

## 0. Lịch sử phiên bản

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| 0.1 | 20/10/2026 | Lập bản nháp từ SRS v1.1 và các quyết định ngày 20/10/2026 (mục 1). |

---

## 1. Quyết định kỹ thuật

| Mã | Quyết định | Trạng thái | Hệ quả |
|---|---|---|---|
| D-01 | Tailwind CSS được biên dịch thành một tệp CSS tĩnh và commit vào repo. Không dùng Tailwind CDN. Máy chủ cục bộ không thêm bước `npm install` | Đã chốt (20/10/2026) | Giữ đúng CLAUDE.md mục 3. Khi đổi class Tailwind phải biên dịch lại và cập nhật `SHA256SUMS.txt` |
| D-02 | Không dùng TTS có sẵn (Gemini TTS). Nguồn âm thanh chỉ còn `upload` hoặc `none` | Đã chốt theo ý người phụ trách. **[Cần xác nhận]**: "TTS có sẵn" nghĩa là bỏ hẳn dịch vụ TTS, hay chỉ không dùng TTS để phát âm bài học? | Nếu bỏ hẳn TTS: FR-KEY-01 đến FR-KEY-09, UC-06, FR-CNT-07, FR-CNT-08, FR-CNT-09 và NFR-SEC-06, 07 trở nên không còn đối tượng. Cần cập nhật SRS trước khi triển khai |
| D-03 | WebM từ ghi âm trực tiếp được chuyển sang MP3 trước khi lưu | Đã chốt theo ý người phụ trách. Cách thực hiện **[Cần xác định]**, xem mục 6.4 | Phát sinh phụ thuộc ffmpeg hoặc bộ mã hóa trong trình duyệt. Mâu thuẫn với SRS mục 5.3 ("ffmpeg không bắt buộc") |
| D-04 | Triển khai song song bản máy chủ cục bộ và bản Sites | Đã chốt theo ý người phụ trách. Thực tế triển khai phụ thuộc việc có mã v4 trên repo | Xem `KIEN_TRUC_VA_BAN_GIAO.md` mục 4 |
| D-05 | Tên migration theo mẫu `NNNN_mo_ta.sql` (đánh số 4 chữ số) | Đề xuất. CLAUDE.md mục 5 và mục 6 đang ghi hai mẫu khác nhau | Cần sửa CLAUDE.md mục 6 cho thống nhất |

---

## 2. Kiến trúc tổng thể

### 2.1. Hai môi trường triển khai

| Thành phần | Bản Sites | Máy chủ cục bộ |
|---|---|---|
| Runtime | Cloudflare Workers | Node.js 22.13 trở lên, không cài thêm gói |
| Cơ sở dữ liệu | D1 | SQLite |
| Lưu tệp (video, âm thanh) | R2 | Thư mục `videos/` và `audio/` trên đĩa |
| Xác thực | Header danh tính của nền tảng Sites (SRS 2.5) | Mật khẩu quản trị (FR-ADM-04), phiên 8 giờ (FR-ADM-05) |
| Khóa Gemini | Secret của nền tảng (FR-KEY-08). **Nếu D-02 được chấp nhận, không còn dùng** | Bộ nhớ tiến trình (FR-KEY). **Nếu D-02 được chấp nhận, không còn dùng** |
| Lắng nghe mạng | Theo nền tảng | `127.0.0.1` (CLAUDE.md mục 8) |

### 2.2. Phân lớp

```
HTTP route  →  Service (nghiệp vụ)  →  Repository (dữ liệu)  →  Adapter (D1 | SQLite)
                                                             →  Storage adapter (R2 | đĩa cục bộ)
```

- Route không chứa truy vấn SQL (CLAUDE.md mục 3).
- Mọi repository dùng cùng một interface `prepare / bind / first / all / run / batch`, để một service chạy được trên cả D1 và SQLite.
- Storage adapter theo mẫu Strategy: `R2Storage` và `LocalFileStorage` cùng implement một interface `put / get / delete / stat`. **[Dự kiến]**

### 2.3. Module nghiệp vụ dùng chung

Các logic dưới đây chỉ được viết một lần trong thư mục `shared/` **[Dự kiến, đường dẫn cần xác nhận với mã v4]** và được cả hai môi trường import. Không sao chép giữa hai bản (NFR-MNT-01).

| Module | Nội dung | Yêu cầu |
|---|---|---|
| `lesson-validation` | Kiểm tra dữ liệu bài học | FR-CNT-02 |
| `progress-merge` | Hợp nhất tiến độ bằng giá trị lớn nhất từng trường | FR-LRN-06; CLAUDE.md mục 4.1 |
| `assessment-rules` | Phiếu quan sát, `null` là "chưa đánh giá", idempotent theo `(learner, client_id)` | FR-OBS-02, FR-OBS-04; CLAUDE.md mục 4.2, 4.3 |
| `dashboard-pre-post` | Đối chiếu trước–sau, chỉ đưa vào nhóm đủ 5 nhiệm vụ ở cả hai lần đo, tỷ lệ không quy `null` thành 0 | FR-DSH-03, FR-DSH-05; CLAUDE.md mục 4.6 |
| `access-policy` | Phân quyền theo vai trò | FR-OBS-05; CLAUDE.md mục 4.8 |
| `audio-signature` | Nhận diện định dạng theo chữ ký nhị phân | FR-CNT-12; CLAUDE.md mục 2B.3 |
| `audio-source-policy` | Quyết định phát âm thanh theo nguồn | FR-CNT-15; xem D-02 |

---

## 3. Mô hình dữ liệu

### 3.1. Thực thể (theo SRS mục 4)

| Bảng | Khóa và ràng buộc | Ghi chú |
|---|---|---|
| `learners` | Khóa chính mã học viên | `[Cần xác minh với mã v4]` tên cột chính xác |
| `progress` | Khóa chính `(learner, lesson)` (DR-01) | Hợp nhất bằng giá trị lớn nhất |
| `assessments` | Khóa duy nhất `(learner, client_id)` (DR-02) | Ô chưa đánh giá lưu `NULL` |
| `lessons` | Chỉ số bài tăng liên tục; không sửa, không xóa (CLAUDE.md mục 4.4) | Thêm cột âm thanh, xem 3.2 |
| `videos` | `kind IN ('file','link')` (DR-03); mỗi bài tối đa một bản ghi | Đăng video mới thay video cũ (FR-CNT-06) |
| `staff` | Email tình nguyện viên | Độc lập với `learners` |

### 3.2. Thay đổi đề xuất cho `lessons` (migration mới)

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `audio_source` | `TEXT` | `NOT NULL DEFAULT 'none'`, `CHECK (audio_source IN ('upload','none'))` | Nếu D-02 bỏ hẳn TTS thì bỏ `'tts'`. Nếu giữ TTS thì thêm `'tts'` |
| `audio_upload_file` | `TEXT` | `NULL` | Tên tệp, không phải nội dung (DR-07). Tệp lưu ngoài cơ sở dữ liệu |
| `audio_signature` | `TEXT` | `NULL` **[Dự kiến]** | Định dạng đã xác minh (`mp3`, `m4a`, `wav`, `ogg`). Dùng để đặt `Content-Type` (NFR-SEC-09) |
| `audio_updated_at` | `TEXT` | `NULL` | ISO 8601 UTC (DR-06) |

**Tác động lên dữ liệu hiện có** (CLAUDE.md mục 5): chỉ `ADD COLUMN` có `DEFAULT`, không rebuild bảng, không đổi dữ liệu cũ. Các bài hiện có nhận `audio_source = 'none'`. Trước khi migrate phải sao lưu, và kiểm tra `PRAGMA foreign_key_check` sau migration.

**Khôi phục:** nếu migration lỗi, D1 hoặc SQLite được khôi phục từ bản sao lưu trước đó. Cột thừa không gây sai nghiệp vụ, nên có thể để lại và dọn ở migration sau.

### 3.3. Quy ước chung

- `PRAGMA foreign_keys = ON` trên mọi kết nối (DR-04).
- Theo dõi phiên bản schema bằng `PRAGMA user_version`.
- Migration đánh số tăng dần, không sửa migration đã áp dụng (DR-05). Migration phải chạy được trên cơ sở dữ liệu rỗng và có dữ liệu.
- Mọi thời điểm lưu theo ISO 8601 UTC (DR-06).

---

## 4. Quy tắc nghiệp vụ

Các quy tắc sau lấy từ CLAUDE.md mục 4. Không đổi nếu chưa có phê duyệt.

| # | Quy tắc | Kiểm thử bắt buộc |
|---|---|---|
| 4.1 | Tiến độ hợp nhất bằng giá trị lớn nhất từng trường | `progress-merge` |
| 4.2 | `null` trong phiếu quan sát là "chưa đánh giá", không thành 0 | `assessment-rules` |
| 4.3 | Phiếu quan sát idempotent theo `(learner, client_id)` | `assessment-rules` |
| 4.4 | Bài học chỉ thêm. Không có API sửa hoặc xóa bài | Kiểm tra route không tồn tại (FR-CNT-03) |
| 4.5 | Video: tối đa 25 MB; mỗi bài đúng một video; liên kết chỉ `https`, không có thông tin đăng nhập trong URL, tối đa 500 ký tự | Từng quy tắc có test từ chối |
| 4.6 | Đối chiếu trước–sau chỉ đưa vào nhóm đủ 5 nhiệm vụ ở cả hai lần đo | `dashboard-pre-post` |
| 4.7 | Không dùng số lượt đọc làm bằng chứng năng lực | Dashboard không có chỉ số đó |
| 4.8 | Tình nguyện viên không xem được dashboard tổng hợp | API trả 403 |
| 4.9 | Âm thanh TTS: tối thiểu 21 giây giữa hai lần gọi; lỗi 429 chờ 65 giây rồi thử lại, tối đa 6 lần | **Chỉ áp dụng nếu D-02 giữ TTS**. Nếu bỏ TTS thì quy tắc này bị loại |
| 4.10 | Nguồn âm thanh: `none` tắt phát; tệp tải lên được ưu tiên hơn TTS; mỗi bài tối đa một tệp tải lên | Chờ xác nhận SRS 9.2 câu 9 và 10 |
| 4.11 | Khóa API chỉ tồn tại trong bộ nhớ tiến trình | **Chỉ áp dụng nếu D-02 giữ TTS** |

### 4.1. Ngữ nghĩa "thay tệp âm thanh" và quy tắc append-only

Quy tắc 4.4 cấm sửa bài học, còn FR-CNT-16 yêu cầu thay tệp âm thanh. **[Cần xác nhận]**: thay tệp âm thanh không được coi là sửa bài, vì nội dung bài (tiêu đề, bước, câu hỏi, đáp án) không đổi. Nếu được chấp nhận, ghi rõ trong SRS rằng thay tệp âm thanh là ngoại lệ có kiểm soát của quy tắc append-only.

---

## 5. Giao diện lập trình (API)

### 5.1. Quy ước chung (SRS 5.2)

- Đường dẫn bắt đầu bằng `/api`.
- JSON cho mọi phản hồi. Lỗi có trường `error` bằng tiếng Việt.
- Mã HTTP: 200, 201, 202, 206, 400, 401, 403, 404, 409, 413, 415, 429, 500.
- Mọi endpoint ghi kiểm tra danh tính, vai trò, `Origin` và dữ liệu đầu vào (CLAUDE.md mục 2).
- Endpoint quản trị yêu cầu phiên quản trị.

### 5.2. Endpoint đã có trong SRS (theo mã yêu cầu)

| Endpoint | Yêu cầu | Ghi chú |
|---|---|---|
| `/api/progress` | FR-LRN-06, 07 | Hợp nhất tiến độ. Trả 403 hoặc 409 khi mã học viên không khớp `[Cần thống nhất mã lỗi]`. Trường `scores` của client bị bỏ qua: điểm kiểm tra chỉ do máy chủ ghi (Mục 2, quyết định 3) |
| `/api/quiz/answer` | FR-LRN-04 | POST `{code, lesson, choice, client_id}`. Máy chủ chấm bằng đáp án trong bảng `lessons`; trả `{ok, correct, attempt_count}`, không trả đáp án. Idempotent theo `(learner, client_id)`; cùng `client_id` khác lựa chọn trả 409; `choice` ngoài danh sách trả 400; dữ liệu bài hỏng trả 503 |
| `/api/assessment` | FR-OBS-01 đến 04 | Idempotent theo `client_id` |
| `/api/dashboard` | FR-DSH-01 đến 07; FR-OBS-05 | Chỉ quản trị viên; tình nguyện viên và học viên nhận 403. Tham số: `from`, `to` (ISO 8601 UTC có `Z`; ngày hiển thị theo Asia/Saigon, UTC+7), `lesson` (0–9), `group` (1–5), `granularity` (`day` hoặc `week`). Tham số rỗng nghĩa là không lọc; tham số sai trả 400 với thông báo tiếng Việt. Phản hồi giữ các trường cũ (`learners`, `assessments`, `staff`, `at`) và thêm `report` = `{filter, learners, lessons, groups, series, prePost}`. `report.learners` chỉ có mã học viên. Ngưỡng đạt không đổi theo bộ lọc |
| `/api/video-link` | FR-CNT-05 | Kiểm tra https, URL, độ dài |

Chi tiết đường dẫn và tên tham số của các endpoint này `[Cần xác minh với mã v4]`.

### 5.3. Endpoint đề xuất cho âm thanh **[Dự kiến]**

| Method và đường dẫn | Mô tả | Phản hồi | Lỗi |
|---|---|---|---|
| `POST /api/admin/lessons/:id/audio` | Tải lên tệp MP3, M4A, WAV, OGG (FR-CNT-11). Đếm byte khi nhận, kiểm tra chữ ký, ghi tệp tạm rồi đổi tên | 201 nếu lần đầu, 200 nếu thay tệp | 400 bài không tồn tại hoặc tham số sai; 403 không đủ quyền hoặc sai `Origin`; 413 quá 10 MB; 415 sai chữ ký |
| `GET /api/lessons/:id/audio` | Phát tệp. `Content-Type` lấy từ `audio_signature`. Kèm `X-Content-Type-Options: nosniff` | 200, hoặc 206 khi có `Range` | 404 nếu không có tệp |
| `PUT /api/admin/lessons/:id/audio-source` | Đặt nguồn `upload` hoặc `none` (theo D-02) | 200 | 400 giá trị ngoài danh sách |
| `POST /api/admin/lessons/:id/recording` | Nhận bản ghi WebM từ ghi âm trực tiếp, chuyển sang MP3 (D-03). **Chỉ endpoint này chấp nhận WebM** | 201 hoặc 200 | 415 nếu không phải WebM hợp lệ; 413 quá kích thước; 503 nếu bộ chuyển đổi không sẵn sàng |

**Lưu ý:** tách endpoint ghi âm khỏi endpoint tải lên để không mở WebM cho tệp tải lên thông thường (FR-CNT-14 chỉ cho ghi âm trực tiếp).

### 5.4. Endpoint khóa Gemini **[Hoãn theo D-02: không dùng Gemini TTS]**

| Method và đường dẫn | Mô tả | Phản hồi |
|---|---|---|
| `POST /api/admin/gemini-key` | Nhập khóa vào bộ nhớ (FR-KEY-01). Kiểm tra theo FR-KEY-09 | `{ connected: boolean, masked: string \| null }` |
| `GET /api/admin/gemini-key` | Chỉ trả trạng thái và bản che (FR-KEY-04). Không bao giờ trả khóa | `{ connected: boolean, masked: string \| null }` |
| `DELETE /api/admin/gemini-key` | Đặt biến về `null` (FR-KEY-05) | `{ connected: false, masked: null }` |

---

## 6. Tệp âm thanh và ghi âm

### 6.1. Quy trình nhận tệp tải lên

1. Kiểm tra phiên quản trị và `Origin`.
2. Đọc luồng, đếm byte. Vượt 10 MB thì hủy, xóa tệp tạm, trả 413.
3. Đọc 12 byte đầu, so với bảng chữ ký. Không khớp thì trả 415, không ghi đĩa (CLAUDE.md mục 9.12).
4. Ghi vào tệp tạm cùng thư mục. Tên tệp đích do máy chủ tạo theo mẫu `lesson-NN.<đuôi theo chữ ký>`.
5. Ghi bản ghi trong cơ sở dữ liệu. Đổi tên tệp tạm thành tệp đích (thao tác nguyên tử).
6. Xóa tệp cũ của bài, nếu có. Nếu bất kỳ bước nào lỗi thì tệp cũ vẫn còn và bản ghi không đổi (CLAUDE.md mục 2B.7).

### 6.2. Bảng chữ ký

Nguồn: CLAUDE.md mục 2B.3.

| Định dạng | Điều kiện trên byte |
|---|---|
| MP3 | Byte 0–2 là `49 44 33` (ID3), hoặc byte 0 là `FF` và `(byte1 & 0xE0) == 0xE0` |
| WAV | Byte 0–3 là `52 49 46 46` và byte 8–11 là `57 41 56 45` |
| OGG | Byte 0–3 là `4F 67 67 53` |
| M4A | Byte 4–7 là `66 74 79 70` và byte 8–11 thuộc `M4A `, `mp42`, `isom` |
| WebM | Byte 0–3 là `1A 45 DF A3`. Chỉ dùng ở endpoint ghi âm |

**Hạn chế đã biết:** chữ ký MP3 chỉ kiểm tra hai byte đầu của frame sync, nên có thể nhận nhầm một số tệp nhị phân ngẫu nhiên. Đây là chấp nhận có giới hạn; tệp không phát được sẽ bị từ chối khi giải mã. **[Cần xác định]** có cần kiểm tra thêm các frame kế tiếp không.

### 6.3. Phát tệp

- `Content-Type` lấy từ `audio_signature` đã lưu, không lấy từ tên tệp.
- `X-Content-Type-Options: nosniff`.
- Hỗ trợ `Range`: trả 206 kèm `Content-Range` đúng.

### 6.4. Chuyển WebM sang MP3 (D-03) **[Cần xác định]**

Đây là điểm chưa có lời giải, vì hai môi trường khác nhau về khả năng:

| Môi trường | Khả năng | Phương án khả thi | Vấn đề |
|---|---|---|---|
| Máy chủ cục bộ | Chạy được tiến trình ngoài | ffmpeg (`-c:a libmp3lame`) | SRS 5.3 ghi "ffmpeg không bắt buộc". Cần đổi thành bắt buộc khi dùng ghi âm, hoặc tắt tính năng khi không có ffmpeg |
| Bản Sites (Workers) | Không chạy được ffmpeg | (a) Mã hóa MP3 trong trình duyệt bằng WASM; (b) dịch vụ chuyển đổi bên ngoài | (a) là thêm phụ thuộc mới, cần phê duyệt (CLAUDE.md mục 3). (b) làm tăng chi phí và đưa dữ liệu giọng nói ra ngoài |

**Đề xuất:** ưu tiên (a) cho bản Sites, và ffmpeg cho bản cục bộ. Cả hai đều phải qua chữ ký ở mục 6.2 sau khi chuyển đổi.

---

## 7. Bảo mật

| Biện pháp | Nguồn |
|---|---|
| Khóa, mật khẩu và `OWNER_EMAIL` chỉ đọc từ biến môi trường; `.env.example` chỉ có tên biến | CLAUDE.md mục 2 |
| Xóa header danh tính giả (`oai-authenticated-*` và tiền tố tương tự) từ client | CLAUDE.md mục 2; NFR-SEC-02 |
| Kiểm tra `Origin` trên mọi yêu cầu ghi | NFR-SEC-03 |
| Thông báo lỗi không chứa khóa, stack trace; che bằng `[đã ẩn]` | NFR-SEC-04, 07 |
| Cookie quản trị: `HttpOnly`, `SameSite=Strict` | NFR-SEC-05 |
| Không dùng `innerHTML`, `eval`, `dangerouslySetInnerHTML` với dữ liệu người dùng | CLAUDE.md mục 2 |
| Đếm kích thước khi nhận luồng; kiểm tra chữ ký; tên tệp do máy chủ tạo; chống path traversal | NFR-SEC-08; CLAUDE.md mục 2B |
| `Content-Type` từ chữ ký; `nosniff` | NFR-SEC-09 |
| Giới hạn tốc độ cho endpoint đăng nhập và nhập khóa | NFR-SEC-10; FR-ADM-04 |
| Khóa API không ghi xuống đĩa, cơ sở dữ liệu, bộ nhớ trình duyệt, cookie hay nhật ký | NFR-SEC-06; CLAUDE.md mục 2A (áp dụng nếu D-02 giữ TTS) |

**Lưu ý về giới hạn tốc độ:** SRS hiện chỉ khóa theo tài khoản (FR-ADM-04). Giới hạn theo IP phải đặt ở reverse proxy khi triển khai. Đây là phụ thuộc hạ tầng, không nằm trong mã.

---

## 8. Kiểm thử

| Loại | Phạm vi | Công cụ và quy ước |
|---|---|---|
| Đơn vị | Module trong `shared/` | `npm test` |
| Tích hợp API | Route, service, repository | SQLite tạm hoặc D1 cục bộ, không mock tầng dữ liệu (CLAUDE.md mục 7) |
| Bảo mật | Mục 2A và 2B của CLAUDE.md | Thêm vào `tests/local-server.test.mjs` hoặc tệp riêng; chạy trong `npm test` |
| Quét đĩa | Sau khi nhập khóa và sau mỗi lần ghi tệp | Chạy trên thư mục dữ liệu tạm, không chạm `local-data/` thật |
| Dịch vụ ngoài | Gemini, YouTube | Không gọi thật; dùng fetch giả lập, đếm số lần gọi |
| Hồi quy lỗi | Mỗi lỗi được sửa | Kèm test tái hiện lỗi đó |

**Danh sách kiểm thử bắt buộc cho tệp âm thanh** (CLAUDE.md mục 2B.11):
- `.txt` đổi tên thành `.mp3` bị 415.
- Tệp 10 MB + 1 byte bị 413, không còn tệp tạm trên đĩa.
- Tệp bắt đầu bằng `RIFF` nhưng không có `WAVE` bị từ chối.
- Tên chứa `../` không tạo được đường dẫn ngoài thư mục âm thanh.
- Phục vụ đúng `Content-Type`, có `nosniff`, trả 206 khi có `Range`.

**Ngưỡng bao phủ:** NFR-MNT-02 đề xuất ≥ 80% cho module nghiệp vụ `[Cần xác định]`.

---

## 9. Triển khai và vận hành

- Bản Sites: không triển khai khi chưa áp dụng migration trên D1 và chưa chạy `npm test` (CLAUDE.md mục 8).
- Bản cục bộ: sao lưu cơ sở dữ liệu trước khi migrate **[Dự kiến]**; migrate; khởi động; kiểm tra `PRAGMA integrity_check`.
- Không thay đổi `OWNER_EMAIL` hoặc cấu hình xác thực trong mã.
- Sau khi phát hành tệp, cập nhật `SHA256SUMS.txt` bằng lệnh tạo lại, không sửa tay (CLAUDE.md mục 8).
- Biến môi trường tối thiểu (tên, không có giá trị): `ADMIN_PASSWORD`, `OWNER_EMAIL`, và `GEMINI_API_KEY` nếu D-02 giữ TTS.

---

## 10. Rủi ro

| Rủi ro | Mức | Biện pháp |
|---|---|---|
| D-02 làm vô hiệu FR-KEY và một phần FR-CNT | Cao | Chốt D-02 trước khi viết mã. Cập nhật SRS |
| Ghi âm trên bản Sites không chuyển được sang MP3 phía máy chủ | Cao | Quyết định phương án mục 6.4 |
| Migration làm hỏng dữ liệu cũ | Cao | Sao lưu, `ADD COLUMN` có `DEFAULT`, kiểm tra `foreign_key_check` |
| Mã v4 không có trên repo, nên không đối chiếu được endpoint và schema | Cao | Xem `KIEN_TRUC_VA_BAN_GIAO.md` mục 4 |
| Chữ ký MP3 nhận nhầm tệp nhị phân | Thấp | Ghi nhận giới hạn (mục 6.2) |
| Ghi tệp dở khi mất điện | Trung bình | Ghi tạm, đổi tên nguyên tử, dọn tệp tạm khi khởi động |

---

## 11. Câu hỏi mở

1. D-02: bỏ hẳn TTS hay chỉ không dùng TTS để phát âm? (Quyết định ảnh hưởng toàn bộ mục 7 và FR-KEY.)
2. Thay tệp âm thanh có được coi là ngoại lệ của quy tắc append-only không? (Mục 4.1.)
3. Chuyển WebM sang MP3 trên bản Sites bằng WASM trong trình duyệt hay dịch vụ ngoài? (Mục 6.4.)
4. ffmpeg cho máy chủ cục bộ: bắt buộc khi dùng ghi âm, hay tính năng ghi âm bị tắt khi không có ffmpeg? (Mâu thuẫn với SRS 5.3.)
5. Đường dẫn và tên tham số chính xác của bốn endpoint ở mục 5.2 (cần mã v4).
6. Xác nhận SRS câu 9 và 10 (quy tắc phát `none` và tệp tải lên).
