# CLAUDE.md — Quy tắc làm việc cho Claude Code trên Sơn Trà Số

Tệp này là quy tắc bắt buộc khi Claude Code đọc, sửa hoặc viết mã trong dự án. Nếu yêu cầu của người dùng mâu thuẫn với tệp này, dừng lại và hỏi trước khi làm.

Tài liệu tham chiếu:
- `SRS_Son_Tra_So.md`: yêu cầu chức năng và phi chức năng (mã FR-, NFR-, DR-).
- `DAC_TA_Son_Tra_So_fullstack.md`: kiến trúc, API, quy tắc nghiệp vụ.
- `docs/KIEN_TRUC_VA_BAN_GIAO.md`: hiện trạng.

---

## 1. Quy trình bắt buộc

1. **Đọc trước, viết sau.** Trước khi sửa, đọc tệp liên quan và các mục SRS/đặc tả có mã yêu cầu tương ứng.
2. **Hỏi khi chưa rõ.** Nếu bài toán có nhiều cách hiểu, ảnh hưởng dữ liệu hoặc quy tắc nghiệp vụ, hỏi người dùng trước khi viết mã. Không tự đoán. Nêu tối đa 5 câu hỏi cụ thể.
3. **Trình kế hoạch cho việc lớn.** Với thay đổi từ 3 tệp trở lên, hoặc thay đổi schema, API, phân quyền, cần: mục tiêu, các tệp sẽ đổi, rủi ro, cách kiểm thử. Chờ người dùng xác nhận.
4. **Một thay đổi, một mục đích.** Không gộp refactor với tính năng mới trong cùng một lần sửa.
5. **Kiểm thử trước khi báo xong.** Chạy `npm test`. Nếu một kiểm thử không chạy được, ghi rõ nguyên nhân; không tắt kiểm thử để qua.
6. **Báo cáo ngắn.** Kết thúc mỗi việc bằng: đã đổi gì, đã kiểm thử gì, còn mở gì. Không lặp lại quá trình làm.
7. **Không tự commit hoặc push** trừ khi người dùng yêu cầu rõ ràng.

---

## 2. Bảo mật và bí mật

- **Không ghi bí mật vào mã nguồn, tài liệu, nhật ký hoặc kết quả kiểm thử.** Bí mật gồm: khóa API (`GEMINI_API_KEY`), mật khẩu quản trị (`ADMIN_PASSWORD`), email chủ website (`OWNER_EMAIL`), chuỗi kết nối, token.
- Bí mật chỉ đọc từ biến môi trường. Tệp mẫu `.env.example` chỉ chứa tên biến, không có giá trị.
- Nếu người dùng dán khóa vào trò chuyện, **không ghi khóa đó vào bất kỳ tệp nào**; nhắc người dùng đổi khóa.
- Thông báo lỗi và nhật ký phải che bí mật (ví dụ thay bằng `[đã ẩn]`).
- Mọi API ghi phải kiểm tra: danh tính, vai trò, `Origin`, dữ liệu đầu vào.
- Xóa mọi header danh tính (`oai-authenticated-*` và tiền tố tương tự) từ client trước khi xử lý.
- Không dùng `innerHTML`, `eval` hay `dangerouslySetInnerHTML` với dữ liệu từ người dùng hoặc API.
- Không đưa thông tin cá nhân vào mã mẫu, video hoặc học liệu.

---

## 2A. Khóa API Gemini trong bộ nhớ tạm (chỉ máy chủ cục bộ)

Áp dụng cho FR-KEY-01 đến FR-KEY-09 và NFR-SEC-06, NFR-SEC-07, DR-08 trong SRS. Đây là quy tắc nghiêm ngặt: vi phạm bất kỳ mục nào là lỗi bảo mật, không phải lỗi giao diện.

1. **Vị trí lưu duy nhất:** khóa chỉ tồn tại trong một biến cấp module của tiến trình máy chủ cục bộ (ví dụ `keyStore`). Không gán vào `process.env` lúc chạy; không đưa vào đối tượng cấu hình được trả ra ngoài.
2. **Cấm lưu bền dưới mọi hình thức:** không ghi khóa vào đĩa (tệp tạm, `.env`, tệp cấu hình, `manifest.json`), vào SQLite hoặc D1, `localStorage`, `sessionStorage`, IndexedDB, cookie, nhật ký, hay bộ nhớ đệm của trình duyệt.
3. **Không trả khóa ra ngoài:** không có endpoint GET nào trả khóa. Endpoint nhập khóa là POST, yêu cầu phiên quản trị và kiểm tra `Origin`. Phản hồi chỉ có dạng `{ connected: boolean, masked: string | null }`.
4. **Bản che:** chỉ hiển thị 4 ký tự cuối, phần còn lại thay bằng `•`. Không hard-code tiền tố (`AIza`, `AQ.`) vì định dạng khóa có thể đổi và tiền tố làm lộ loại khóa.
5. **Thứ tự lấy khóa:** bộ nhớ → `GEMINI_API_KEY` → nếu không có cả hai thì tắt TTS và trả trạng thái `disabled`. Không bao giờ ghi khóa từ bộ nhớ ngược vào biến môi trường.
6. **Xóa khóa:** endpoint xóa đặt biến về `null` rồi trả trạng thái mới. Không tạo bản sao ở biến trung gian. Trường nhập trên giao diện phải được xóa ngay sau khi gửi.
7. **Giới hạn của JavaScript:** chuỗi không thể xóa khỏi bộ nhớ một cách đảm bảo. Vì vậy phải giảm số bản sao: không ghép chuỗi khóa vào nhật ký, không đưa khóa vào JSON trung gian không cần thiết, không truyền khóa qua nhiều hàm nếu có thể.
8. **Thông báo lỗi:** trước khi ghi nhật ký hoặc trả lỗi, thay khóa và mọi chuỗi giống khóa bằng `[đã ẩn]`.
9. **Phạm vi:** tính năng này chỉ nằm trong `server-local/`. Không thêm endpoint nhập khóa vào mã dùng chung hoặc vào `app/api/` của bản Sites.
10. **Kiểm thử bắt buộc:**
    - Sau khi nhập khóa, quét `local-data/` và SQLite; không tìm thấy chuỗi khóa.
    - Mọi phản hồi HTTP và nhật ký của luồng nhập khóa, tạo âm thanh, và lỗi 429 không chứa khóa.
    - Khởi động lại tiến trình thì trạng thái trở về "Chưa có khóa".
    - Sau khi xóa khóa, yêu cầu TTS bị từ chối và **không có lệnh gọi mạng nào** (kiểm tra bằng fetch giả lập đếm số lần gọi).
11. **Gỡ lỗi:** không in khóa ra console hoặc nhật ký, kể cả tạm thời. Kiểm tra bằng độ dài và bản che.

---

## 2B. Tệp âm thanh tải lên

Áp dụng cho FR-CNT-10 đến FR-CNT-17 và NFR-SEC-08, NFR-SEC-09 trong SRS.

1. **Định dạng và kích thước:** chấp nhận MP3, M4A, WAV, OGG. WebM chỉ chấp nhận cho bản ghi trực tiếp, và chỉ khi FR-CNT-14 đã được phê duyệt. Tối đa 10 MB.
2. **Giới hạn khi nhận luồng:** đếm byte khi đọc. Vượt 10 MB thì hủy, xóa tệp tạm, trả 413. Không đọc toàn bộ rồi mới kiểm tra kích thước.
3. **Kiểm tra chữ ký (magic bytes):** đọc tối thiểu 12 byte đầu và so với bảng dưới. Không khớp thì từ chối, kể cả khi đuôi tệp hợp lệ.

   | Định dạng | Điều kiện trên byte |
   |---|---|
   | MP3 | Byte 0–2 là `49 44 33` ("ID3"), hoặc byte 0 là `FF` và `(byte1 & 0xE0) == 0xE0` (frame sync) |
   | WAV | Byte 0–3 là `52 49 46 46` ("RIFF") và byte 8–11 là `57 41 56 45` ("WAVE") |
   | OGG | Byte 0–3 là `4F 67 67 53` ("OggS") |
   | M4A | Byte 4–7 là `66 74 79 70` ("ftyp") và byte 8–11 thuộc tập brand đã duyệt: `M4A ` (có khoảng trắng cuối), `mp42`, `isom` |
   | WebM | Byte 0–3 là `1A 45 DF A3` (EBML). Chỉ dùng khi FR-CNT-14 được duyệt |

4. **Không tin metadata do client gửi:** đuôi tệp, `Content-Type` và tên tệp chỉ dùng để hiển thị. Định dạng thực tế lấy từ chữ ký.
5. **Tên tệp trên đĩa:** do máy chủ tạo, dạng `lesson-NN.<đuôi theo chữ ký>`. Không dùng tên người dùng cung cấp trong bất kỳ đường dẫn nào. Kiểm tra đường dẫn đích nằm trong thư mục âm thanh (chống path traversal).
6. **Ghi an toàn:** ghi vào tệp tạm trong cùng thư mục; khi đã qua mọi kiểm tra thì đổi tên nguyên tử. Nếu lỗi giữa chừng, xóa tệp tạm và giữ nguyên tệp cũ.
7. **Thay tệp:** ghi tệp mới → cập nhật bản ghi hoặc manifest → xóa tệp cũ. Nếu bất kỳ bước nào lỗi, tệp cũ vẫn còn và bản ghi không đổi.
8. **Phục vụ tệp:** `Content-Type` lấy từ chữ ký đã lưu, không lấy từ tên tệp. Thêm `X-Content-Type-Options: nosniff`. Hỗ trợ `Range`.
9. **Ghi âm trực tiếp (MediaRecorder):** chỉ chạy trong ngữ cảnh an toàn (localhost hoặc HTTPS). Bản ghi đi qua đúng các kiểm tra ở mục 3; trình duyệt không được miễn kiểm tra.
10. **Thứ tự phát:** theo FR-CNT-15 — có tệp tải lên thì phát tệp (ưu tiên); không có tệp tải lên và nguồn `tts` thì phát TTS dự phòng; còn lại thì không phát. Quy tắc ưu tiên đã được xác nhận ngày 2026-10-29 (SRS Mục 9.2, câu 10). Trường hợp nguồn `none` có tệp tải lên (SRS Mục 9.2, câu 9) vẫn chờ quyết định.
11. **Kiểm thử bắt buộc:**
    - Tệp `.txt` đổi tên thành `.mp3` bị 415.
    - Tệp 10 MB + 1 byte bị 413, và không còn tệp tạm trên đĩa.
    - Tệp bắt đầu bằng `RIFF` nhưng không có `WAVE` bị từ chối.
    - Tên chứa `../` không tạo được đường dẫn ngoài thư mục âm thanh.
    - Phục vụ đúng `Content-Type`, có `nosniff`, và trả 206 khi có `Range`.

---

## 2C. Đăng nhập, phiên và tài khoản (SRS FR-AUTH-01 đến FR-AUTH-10)

Áp dụng cho quản trị viên và tình nguyện viên. Học viên vẫn xác định bằng header danh tính của Sites (SRS Mục 2.5). Vi phạm mục này là lỗi bảo mật.

1. **Mật khẩu chỉ lưu dạng băm** PBKDF2-SHA256 (100 000 vòng, muối ngẫu nhiên, module `shared/password-hash.ts`). Không lưu, không ghi nhật ký, không trả về mật khẩu dạng rõ ở bất kỳ đâu.
2. **Mã phiên chỉ lưu dạng băm SHA-256.** Mã phiên là chuỗi ngẫu nhiên 256 bit, chỉ được gửi một lần trong cookie `st_session`.
3. **Cookie phiên:** `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, thời hạn 12 giờ. Không đưa mã phiên vào URL, JSON phản hồi hay nhật ký.
4. **Mật khẩu mặc định của quản trị:** không có giá trị mặc định trong mã, tài liệu, `.env.example` hay kết quả kiểm thử. Tài khoản quản trị chỉ được tạo từ biến môi trường `ADMIN_PASSWORD` ở lần đăng nhập đầu tiên; sau đó biến này bị bỏ qua. Trong kiểm thử, dùng giá trị giả do `tests/route-harness.mjs` cấp, không dùng giá trị thật.
5. **Khóa tạm:** 5 lần sai liên tiếp → khóa 15 phút; yêu cầu trong thời gian khóa trả 423. Thông báo lỗi đăng nhập không tiết lộ email có tồn tại hay không.
6. **Thông báo lỗi và nhật ký** không chứa mật khẩu, mã phiên, cookie hoặc giá trị `ADMIN_PASSWORD`; che bằng `[đã ẩn]` (áp dụng mục 2 và NFR-SEC-04).
7. **Mọi API ghi** (`POST`) kiểm tra phiên, vai trò, `Origin` và dữ liệu đầu vào trước khi xử lý (mục 2, NFR-SEC-03).
8. **Thay đổi phiên:** đổi mật khẩu, đặt lại mật khẩu hoặc vô hiệu hóa tài khoản đều đăng xuất các phiên liên quan.

---

## 3. Kiến trúc và thiết kế

- **Logic nghiệp vụ nằm trong module dùng chung** (kiểm tra bài học, hợp nhất tiến độ, phiếu quan sát, đối chiếu trước–sau, phân quyền). Không sao chép logic giữa bản Sites và máy chủ cục bộ.
- **Tách lớp rõ ràng:** route (HTTP) → service (nghiệp vụ) → repository (dữ liệu). Route không chứa truy vấn SQL trực tiếp.
- **Lớp truy cập dữ liệu** dùng interface `prepare/bind/first/all/run/batch`, để cùng một service chạy trên D1 và SQLite.
- **Áp dụng design pattern khi có lợi:** Strategy (nhà cung cấp TTS, lưu trữ tệp), Repository (dữ liệu), Adapter (D1, R2, SQLite, thư mục cục bộ), Queue (hàng đợi âm thanh, hàng đợi gửi phiếu). Không dùng pattern khi chưa có nhu cầu rõ.
- **Không để một tệp quá lớn.** Tệp route hiện có hàng trăm dòng; khi thêm chức năng, tách theo tính năng.
- **Không thêm phụ thuộc mới** khi chưa hỏi. Máy chủ cục bộ hiện không cần `npm install`; giữ nguyên.

---

## 4. Quy tắc nghiệp vụ không được đổi nếu chưa có phê duyệt

1. Tiến độ hợp nhất bằng giá trị lớn nhất từng trường.
2. `null` trong phiếu quan sát là "chưa đánh giá", **không** được chuyển thành 0.
3. Phiếu quan sát idempotent theo `(learner, client_id)`.
4. Bài học chỉ thêm (append-only). Không thêm API sửa hoặc xóa bài.
5. Video: tối đa 25 MB; mỗi bài có đúng một video; liên kết chỉ https, không có thông tin đăng nhập trong URL, tối đa 500 ký tự.
6. Dashboard đối chiếu trước–sau chỉ đưa vào nhóm đủ 5 nhiệm vụ ở cả hai lần đo.
7. Không dùng số lượt đọc bài làm bằng chứng năng lực.
8. Tình nguyện viên không xem được dashboard tổng hợp.
9. Âm thanh: tối thiểu 21 giây giữa hai lần gọi TTS; lỗi 429 chờ 65 giây rồi thử lại; tối đa 6 lần.
10. Nguồn âm thanh: tệp tải lên được ưu tiên hơn TTS, TTS chỉ là dự phòng khi bài chưa có tệp tải lên (đã xác nhận ngày 2026-10-29, SRS Mục 9.2, câu 10); mỗi bài có tối đa một tệp tải lên. Hành vi của nguồn `none` khi đã có tệp tải lên chưa quyết định (SRS Mục 9.2, câu 9).
11. Khóa API chỉ tồn tại trong bộ nhớ tạm theo Mục 2A; không có đường lưu bền nào được phép.
12. Tình nguyện viên chỉ ghi phiếu quan sát khi tài khoản đang hoạt động, email nằm trong danh sách được cấp quyền và không còn cờ buộc đổi mật khẩu. Tình nguyện viên không xem dashboard và không quản lý tài khoản (SRS FR-AUTH-10).
13. Mật khẩu tối thiểu 10 ký tự, tối đa 200 ký tự khi tạo, đặt lại và đổi; đăng nhập không kiểm tra độ dài (SRS FR-AUTH-02). Ngưỡng này đã được chủ website xác nhận; đổi ngưỡng cần phê duyệt.
14. Tài khoản tạo mới hoặc vừa được đặt lại mật khẩu phải đổi mật khẩu ở lần đăng nhập kế tiếp trước khi dùng mọi chức năng khác (SRS FR-AUTH-07).

---

## 5. Cơ sở dữ liệu và migration

- Mọi thay đổi schema phải qua migration mới, đánh số tăng dần, dạng `NNNN_mo_ta.sql`.
- **Không sửa migration đã áp dụng.** Nếu cần sửa, tạo migration mới.
- Migration phải chạy được trên cơ sở dữ liệu rỗng và trên cơ sở dữ liệu có dữ liệu.
- Bật `PRAGMA foreign_keys = ON`. Theo dõi phiên bản bằng `PRAGMA user_version`.
- Mọi thời điểm lưu theo ISO 8601 UTC.
- Trước khi đổi schema, ghi rõ tác động lên dữ liệu hiện có và cách khôi phục.

---

## 6. Quy ước mã

**TypeScript và JavaScript**
- TypeScript cho mã mới ở backend và frontend khi có thể; không mở rộng mã JavaScript thuần thêm nếu không cần.
- Không dùng `any` trừ khi có chú thích lý do.
- Hàm nhỏ, một trách nhiệm; tên biến và hàm bằng tiếng Anh, mô tả rõ hành vi.
- Không để `console.log` trong mã sản phẩm; dùng logger có che bí mật.

**Giao diện**
- Mọi màn hình có trạng thái tải, rỗng, lỗi và thành công.
- Chữ hiển thị cho người dùng bằng tiếng Việt có dấu.
- Kiểm tra ở 360 px; không cuộn ngang.
- Nút tối thiểu 44×44 px; có nhãn cho form; điều hướng được bằng bàn phím.

**Đặt tên**
- Tệp: `kebab-case` cho tệp giao diện và tài liệu; `camelCase` cho hàm và biến; `PascalCase` cho class và component.
- Tên tệp migration: `NNNN_mo_ta_ngan.sql`.
- Mã yêu cầu: tham chiếu trong comment khi triển khai, ví dụ `// FR-OBS-04`.

**Comment**
- Comment giải thích lý do, không mô tả điều hiển nhiên.
- Comment và tài liệu viết bằng tiếng Việt.

---

## 7. Kiểm thử

- Mỗi quy tắc nghiệp vụ ở Mục 4 phải có ít nhất một kiểm thử tự động.
- Mỗi lỗi được sửa phải có kiểm thử tái hiện lỗi đó.
- Kiểm thử API dùng cơ sở dữ liệu thật (SQLite tạm hoặc D1 cục bộ), không dùng mock cho tầng dữ liệu.
- Kiểm thử không được gọi dịch vụ bên ngoài thật (Gemini, YouTube). Dùng fetch giả lập.
- Kiểm thử bắt buộc cho Mục 2A và 2B (liệt kê trong từng mục) phải được thêm vào `tests/local-server.test.mjs` hoặc tệp kiểm thử riêng và chạy trong `npm test`.
- Kiểm thử quét đĩa phải chạy trên thư mục dữ liệu tạm, không trên thư mục thật của người dùng.
- Không xóa hoặc bỏ qua kiểm thử để nộp bài. Nếu cần bỏ qua tạm thời, ghi lý do và ngày, và hỏi người dùng.

Lệnh chuẩn: `npm test` chạy đủ các tệp trong `tests/`.

---

## 8. Triển khai và vận hành

- Không triển khai lên Sites khi chưa áp dụng migration trên D1 và chưa chạy kiểm thử.
- Không thay đổi `OWNER_EMAIL` hoặc cấu hình xác thực trong mã; các giá trị này do người phụ trách đặt.
- Sau mỗi thay đổi tệp đã phát hành, cập nhật `SHA256SUMS.txt` bằng lệnh tạo lại, không sửa tay.
- Máy chủ cục bộ chỉ lắng nghe `127.0.0.1`. Không đổi sang `0.0.0.0` nếu không được phê duyệt.

---

## 9. Những việc Claude Code không được làm

1. Ghi bí mật vào bất kỳ tệp nào, kể cả tệp mẫu.
2. Sửa migration đã áp dụng.
3. Xóa dữ liệu trong cơ sở dữ liệu hoặc thư mục `local-data/` mà không hỏi.
4. Thêm API sửa hoặc xóa bài học.
5. Đổi quy tắc ở Mục 4 để làm kiểm thử qua.
6. Bịa nguồn, DOI hoặc số liệu trong tài liệu học thuật. Nếu thiếu nguồn, gắn `[Cần bổ sung nguồn]`.
7. Tự commit, push, hoặc thay đổi cấu hình triển khai khi chưa được yêu cầu.
8. Dùng `pkill -f` hoặc lệnh tương tự có thể kill chính tiến trình đang chạy.
9. Tắt kiểm tra TLS, bỏ qua giới hạn kích thước tệp, hoặc bỏ kiểm tra `Origin`.
10. Nhập, lưu hoặc hiển thị khóa API qua bất kỳ kênh nào ngoài Mục 2A.
11. Dùng đuôi tệp, `Content-Type` hoặc tên tệp do client gửi để quyết định định dạng.
12. Ghi tệp âm thanh vào đĩa trước khi kiểm tra chữ ký xong.
13. Đưa khóa, tiền tố khóa hoặc bản che có nhiều hơn 4 ký tự vào nhật ký, thông báo lỗi hay phản hồi.
14. Đặt mật khẩu mặc định, mật khẩu thử hoặc giá trị `ADMIN_PASSWORD` thật vào mã nguồn, tài liệu, tệp mẫu hoặc kết quả kiểm thử.

---

## 10. Định dạng đầu ra khi trả lời người dùng

- Tiếng Việt chuẩn học thuật cho tài liệu; tiếng Việt thân thiện nhưng rõ ràng cho trao đổi.
- Thuật ngữ kỹ thuật giữ tiếng Anh (API, migration, schema, Range, idempotent).
- Tài liệu dạng Markdown (`.md`); tránh `.docx` trừ khi được yêu cầu.
- Khi tách dữ liệu thực tế với suy luận, ghi rõ: "Dữ liệu/Sự thật" và "Suy luận".
- Không nói "tôi không thể" mà không đưa phương án thay thế.
