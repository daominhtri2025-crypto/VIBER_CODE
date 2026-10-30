# Hướng dẫn vận hành và chuyển giao kỹ thuật · Sơn Trà Số

Tài liệu này dành cho người nhận bàn giao và người vận hành. Mọi lệnh đều đã đối chiếu với repo ở commit `75531c9`, nhánh `Son_tra_so`. Chỗ nào chưa xác minh được trên hạ tầng thật được đánh dấu **[Cần bổ sung nguồn]** hoặc **[Cần xác minh]**.

> Không ghi giá trị bí mật vào tài liệu, mã nguồn hay nhật ký. Các biến `OWNER_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_COOKIE`, và token Cloudflare chỉ được đặt trong cấu hình của môi trường chạy.

---

## 1. Kiến trúc hệ thống sau refactor

### 1.1 Cấu trúc thư mục

| Thư mục / tệp | Vai trò |
|---|---|
| `app/api/[...path]/route.ts` | Tầng HTTP: đọc header danh tính, kiểm tra quyền, kiểm tra `Origin` với POST, gọi service, đổi kết quả thành HTTP. **Không còn câu SQL nào.** |
| `shared/*.ts` | Logic nghiệp vụ dùng chung giữa Sites và máy chủ cục bộ. Đây là **thư mục phẳng**, không có thư mục con `services/`. |
| `shared/*-service.ts` | Các dịch vụ có truy vấn SQL: `identity`, `quiz`, `progress`, `lesson`, `video`, `staff`, `assessment`, `dashboard-summary`, `dashboard-queries`. |
| `shared/*-rules.ts` | Quy tắc thuần, không truy vấn: `quiz-rules`, `video-rules`, `progress-rules`, `dashboard-rules`, `assessment-rules`, `lesson-validation`. |
| `shared/body-limit.ts` | Đọc thân yêu cầu có giới hạn byte. Dùng cho `upload-video`. |
| `drizzle/` | Migration `0000`–`0008` và snapshot của drizzle-kit. Riêng `0006`, `0007` và `0008` chưa có snapshot (xem mục 4.2). |
| `tests/` | Kiểm thử tự động, chạy bằng `npm test`. Xem mục 2. |
| `tests/load/k6-public-reads.js` | Kịch bản đo tải k6 (mục 3). |
| `public/` | Giao diện tĩnh: trang học, trang điều phối, báo cáo quản trị. |
| `docs/` | Tài liệu kiến trúc và hướng dẫn này. |

### 1.2 Tầng nghiệp vụ

Quy ước: route → service → repository (truy vấn SQL trong service). Service nhận một giao diện tối thiểu `prepare/bind/first/all/run/batch`, nên cùng một mã chạy được trên D1 và trên SQLite trong kiểm thử.

| Nhóm | Module chính | Ghi chú |
|---|---|---|
| Xác thực, học viên | `identity-service.ts` | `isStaffEmail` tra bảng `staff`; `ensureLearnerCode` tạo mã học viên một lần bằng `INSERT OR IGNORE`. Cờ quản trị `OWNER_EMAIL` vẫn ở route. |
| Khôi phục mật khẩu qua email (FR-AUTH-11) | `password-reset-service.ts`, `password-reset-rules.ts`, `mail-sender.ts` | Token 256 bit chỉ lưu băm; hiệu lực 15 phút; dùng một lần; yêu cầu mới vô hiệu hóa token cũ; tối đa 3 yêu cầu mỗi tài khoản mỗi giờ; mọi trường hợp trả cùng một phản hồi; gửi qua Resend bằng `fetch`, không thêm thư viện. Liên kết dạng `APP_BASE_URL/admin#dat-lai=<token>`: token nằm ở fragment, trang quản trị xóa khỏi thanh địa chỉ sau khi đọc. |
| Đăng nhập quản trị và tình nguyện viên (FR-AUTH) | `auth-service.ts`, `auth-rules.ts`, `password-hash.ts` | Email và mật khẩu; băm PBKDF2-SHA256 (100 000 vòng); mã phiên chỉ lưu băm SHA-256; khóa tạm 5 lần sai/15 phút; phiên 12 giờ; cookie `st_session` HttpOnly, Secure, SameSite=Lax. Tài khoản quản trị khởi tạo từ `ADMIN_PASSWORD` ở lần đăng nhập đầu tiên. Route `app/api/[...path]/route.ts` chỉ gọi service. |
| Trắc nghiệm | `quiz-service.ts`, `quiz-rules.ts` | Chấm trên máy chủ; idempotent theo `(learner, client_id)`; điểm chỉ tăng. |
| Tiến độ | `progress-service.ts`, `progress-rules.ts` | Hợp nhất `read`/`done` bằng `MAX`; `recordQuizPass` ghi điểm kiểm tra. |
| Bài học | `lesson-service.ts`, `lesson-validation.ts` | Trả 503 khi thiếu hoặc hỏng dữ liệu bài (không trả danh sách dở dang). |
| Video | `video-service.ts`, `video-rules.ts` | `listVideos`, `findVideoByLesson`, `replaceWithVideoLink`, `storeUploadedVideo`. Kho R2 đi qua giao diện `VideoStorage`. |
| Tải video lên | `storeUploadedVideo` + `body-limit.ts` | Thứ tự bắt buộc: kiểm tra thông tin → nhận dạng chữ ký → ghi R2 → ghi DB (lỗi thì xóa tệp mới) → xóa tệp cũ. Giới hạn đọc thân 27 MB, tệp 25 MB. |
| Phiếu quan sát | `assessment-service.ts` | Idempotent theo `(learner, client_id)`; `null` là "chưa đánh giá", không đổi thành 0. |
| Phân quyền TNV | `staff-service.ts` | Chỉ quản trị viên cấp và thu hồi quyền. |
| Báo cáo | `dashboard-rules.ts`, `dashboard-queries.ts`, `dashboard-summary.ts` | Ngưỡng đạt 70% trên 10 bài; múi giờ UTC+7; đối chiếu trước–sau chỉ với nhóm đủ 5 nhiệm vụ ở cả hai lần đo. |

### 1.3 Các mốc đã hoàn thành

- Đã tách toàn bộ SQL khỏi `route.ts` theo nhóm, mỗi nhóm một commit. Chuỗi commit từ `24a377b` đến `f769d89`.
- Migration `0005` chỉ thêm chỉ mục báo cáo, không đổi dữ liệu.
- Giới hạn tải video: đếm byte khi đọc luồng (không tin `Content-Length`).

### 1.4 Điểm còn mở về kiến trúc

- Thân yêu cầu upload được giữ trong bộ nhớ tới 27 MB. Chưa phải parse multipart theo luồng.
- Thời lượng video do client gửi và được tin tưởng.
- Thay video tạo tệp R2 mới; chưa có chính sách dọn tệp cũ khi vận hành lâu dài.
- CLAUDE.md nhắc thư mục `server-local/` nhưng repo hiện **không có** thư mục này. **[Cần xác minh]** xem đây là lỗi tài liệu hay cần tạo mới.

---

## 2. Chạy kiểm thử và đảm bảo chất lượng

### 2.1 Chuỗi kiểm thử chính

```bash
cd viber_code
npm install            # hoặc pnpm install theo packageManager trong package.json
npm test               # chạy tuần tự 19 tệp, gồm tests/auth.test.mjs; exit 0 là đạt
```

`npm test` dùng SQLite thật (`node:sqlite`, bộ nhớ) và adapter D1 giả lập trong `tests/route-harness.mjs`. Không gọi Gemini, YouTube hay Cloudflare thật. Danh sách tệp nằm trong `package.json`, mục `scripts.test`.

**Lưu ý tên lệnh:** mục 2 của `docs/KIEN_TRUC_VA_BAN_GIAO.md` ghi `pnpm test`, nhưng script thật trong repo là `npm test`. Cả hai đều chạy cùng chuỗi tệp nếu dùng đúng trình quản lý gói.

### 2.2 Kiểm tra kiểu tĩnh

Không có script riêng trong `package.json`. Chạy trực tiếp cho các module `shared/`:

```bash
npx tsc --strict --noEmit --target es2022 --module esnext --moduleResolution bundler \
  shared/identity-service.ts shared/video-service.ts shared/body-limit.ts \
  shared/lesson-service.ts shared/quiz-service.ts shared/progress-service.ts \
  shared/staff-service.ts shared/assessment-service.ts shared/dashboard-summary.ts \
  shared/auth-service.ts shared/auth-rules.ts shared/password-hash.ts
```

Kết quả mong đợi: exit 0.

### 2.3 Lint và build

```bash
npm run lint    # kỳ vọng: 0 lỗi, 15 cảnh báo (cảnh báo có sẵn từ trước)
npm run build   # kỳ vọng: exit 0
```

### 2.4 Kiểm thử giao diện 360 px

Không nằm trong `npm test` vì cần Playwright và Chromium đã cài sẵn. Chạy:

```bash
node tests/admin-page-browser.mjs            # đầu ra mặc định: /tmp/admin-shots
node tests/admin-page-browser.mjs <thư-mục-tạm>
```

- Kết quả đạt: 11 ca `PASS`, exit 0 (kiểm thử 360 px, lọc, CSV có BOM, chống công thức CSV, không lỗi console). Ca này chỉ kiểm thử trang đã đăng nhập; **chưa** kiểm thử màn hình đăng nhập, đổi mật khẩu bắt buộc và giao diện tình nguyện viên trên trình duyệt.
- Thoát với mã 2 nếu thiếu Playwright.
- **Không** truyền `public` làm thư mục đầu ra: tệp ảnh và CSV sẽ được ghi vào `public/`.

### 2.5 Kiểm tra toàn vẹn tài liệu

```bash
sha256sum -c SHA256SUMS.txt --quiet    # kỳ vọng: exit 0
```

Sau mỗi thay đổi tệp đã phát hành, tạo lại `SHA256SUMS.txt` bằng lệnh tạo lại, không sửa tay.

---

## 3. Đo tải (NFR-PERF-03)

### 3.1 Mục tiêu đã duyệt

- 500 học viên đồng thời; API dashboard dưới 1 giây (p95).
- Chỉ đo trên **staging**, không đo trên production.

### 3.2 Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `BASE_URL` | Có | URL staging, ví dụ `https://<tên-staging>.<domain>`. Không dùng URL production. |
| `ADMIN_COOKIE` | Không | Cookie phiên quản trị trên staging. Thiếu biến này thì kịch bản quản trị bị bỏ qua. Không ghi giá trị vào repo, shell history hay nhật ký chia sẻ. |

### 3.3 Chạy kịch bản

```bash
# Cài k6 trên máy chạy tải trước (không có trong repo)
export BASE_URL="https://<staging>"
export ADMIN_COOKIE="<lấy từ trình duyệt đăng nhập quản trị trên staging>"   # tùy chọn
k6 run tests/load/k6-public-reads.js
```

Kịch bản gồm:
- Học viên: ramp 100 → 500 người đồng thời, đọc `GET /api/lessons` và `GET /api/videos`. Tổng khoảng 11 phút.
- Quản trị (nếu có `ADMIN_COOKIE`): 5 người đồng thời, `GET /api/dashboard`, 10 phút.
- Ngưỡng: p95 dưới 1 giây; tỷ lệ lỗi dưới 1%.

### 3.4 Khung giờ

- **01:00–03:00 sáng UTC+7**, tương đương **18:00–20:00 UTC ngày hôm trước**.
- Đặt lịch chạy theo UTC để tránh lệch múi giờ khi máy chạy không ở Việt Nam.

### 3.5 Hạn chế của kịch bản hiện tại

- Chỉ đo đường đọc công khai và dashboard. **Chưa** đo đường ghi (trắc nghiệm, đồng bộ tiến độ, phiếu quan sát, upload video).
- Học viên giả lập không đăng nhập, nên không đo đường `me` và tiến độ.
- Chưa chạy trên D1 thật. Số liệu chỉ có ý nghĩa khi chạy trên staging có D1 riêng.

### 3.6 Quy trình khuyến nghị

1. Chạy quy mô nhỏ trước (ví dụ 20 học viên) để kiểm tra kịch bản và biến môi trường.
2. Đọc kết quả, rồi mới chạy đủ 500 người đồng thời trong khung giờ đã duyệt.
3. Lưu báo cáo k6 (đầu ra console) vào thư mục ngoài repo; không commit kết quả có chứa URL nội bộ hay cookie.

---

## 4. Migration và triển khai

### 4.1 Nguyên tắc

- Không sửa, không đổi tên `drizzle/0000_fancy_rogue.sql`. Tệp này có thể đã áp dụng trên D1.
- Đã áp dụng thử `0000`–`0005` trên D1 cục bộ; `0006` chưa áp dụng thử (xem mục 4.3).
- Migration mới đánh số tăng dần `NNNN_mo_ta.sql`. Sinh bằng `npm run db:generate` (drizzle-kit), sau đó **đọc SQL trước khi áp dụng**.
- Sau mỗi migration, chạy `npx drizzle-kit check` để xác nhận snapshot khớp schema (lệnh này không có trong `package.json`, cần gọi trực tiếp).
- Không dùng SQL tạo lại bảng (`CREATE TABLE` mới, `INSERT ... SELECT`, `DROP TABLE`) nếu chưa có phê duyệt riêng.

### 4.2 Thứ tự áp dụng

| Thứ tự | Tệp | Nội dung đã đối chiếu với SQL | Tác động dữ liệu |
|---|---|---|---|
| 1 | `0000_fancy_rogue.sql` | Tạo `learners`, `staff`, `videos`, `progress`, `assessments`; chỉ mục unique `learners_code_unique` | Tạo bảng mới |
| 2 | `0001_mo_rong_idempotency_video_bai_hoc.sql` | Tạo `lessons`; thêm `assessments.client_id` và chỉ mục unique cho idempotency; thêm `videos.kind` (mặc định `'file'`) và `videos.url` | Thêm cột và bảng; dữ liệu cũ giữ nguyên, `kind` mặc định `'file'` |
| 3 | `0002_seed_bai_hoc.sql` | `INSERT` 10 bài học vào `lessons` | Ghi dữ liệu bài học |
| 4 | `0003_mo_rong_completed_at.sql` | Thêm `progress.completed_at` (text, có thể NULL) | Thêm cột; dòng cũ có `completed_at` = NULL |
| 5 | `0004_quiz_attempts.sql` | Tạo `quiz_attempts`; chỉ mục unique `(learner, client_id)` | Tạo bảng mới |
| 6 | `0005_bao_cao_chi_muc.sql` | Chỉ thêm 4 chỉ mục: `progress_completed_at_idx`, `progress_lesson_idx`, `quiz_attempts_learner_lesson_idx`, `quiz_attempts_lesson_created_idx` | Không đổi dữ liệu |
| 7 | `0006_tai_khoan_phien.sql` | Tạo `accounts` và `sessions`; chỉ mục `sessions_account_idx`. Không sửa bảng cũ. Tài khoản quản trị không được ghi trước; chỉ được tạo khi đăng nhập đầu tiên bằng `ADMIN_PASSWORD` | Tạo bảng mới; dữ liệu cũ giữ nguyên. Khôi phục (chỉ khi phê duyệt): `DROP TABLE sessions; DROP TABLE accounts;` — làm mất tài khoản và phiên đăng nhập |
| 8 | `0007_tin_tuc.sql` | Tạo `news` và chỉ mục `news_visible_published_idx`. Không sửa bảng cũ | Tạo bảng mới; dữ liệu cũ giữ nguyên. Khôi phục (chỉ khi phê duyệt): `DROP INDEX news_visible_published_idx; DROP TABLE news;` — làm mất tin đã đăng |
| 9 | `0008_dat_lai_mat_khau.sql` | Tạo `password_reset_tokens` (token băm SHA-256, hết hạn 15 phút, khóa ngoại tới `accounts`, xóa theo tài khoản) và chỉ mục `password_reset_tokens_account_idx`. Không sửa bảng cũ | Tạo bảng mới; dữ liệu cũ giữ nguyên. Khôi phục (chỉ khi phê duyệt): `DROP INDEX password_reset_tokens_account_idx; DROP TABLE password_reset_tokens;` — chỉ mất lịch sử token, không ảnh hưởng tài khoản |
| 10 | `0009_gioi_han_yeu_cau.sql` | Tạo `request_limits` (bộ đếm theo cửa sổ giờ, khóa là băm IP). Không sửa bảng cũ | Tạo bảng mới. Khôi phục (chỉ khi phê duyệt): `DROP TABLE request_limits;` — chỉ mất bộ đếm |

Các bước phải chạy theo đúng thứ tự. Khôi phục khi lỗi giữa chừng: **[Cần bổ sung nguồn]** (chưa có quy trình rollback đã kiểm chứng trên D1).

### 4.3 Kiểm chứng trước khi áp dụng

- Đã áp dụng thử `0000`–`0005` trên **D1 cục bộ (Wrangler)** không lỗi (theo `docs/KIEN_TRUC_VA_BAN_GIAO.md`).
- Migration `0006`: **chưa** áp dụng thử trên D1 cục bộ; `tests/migrations.test.mjs` kiểm tra trên SQLite. **[Cần xác minh]** trên Wrangler D1 trước khi áp dụng staging.
- Migration `0006` chưa có snapshot drizzle-kit (`drizzle/meta/0006_snapshot.json`). Cần sinh hoặc ghi nhận lý do trước khi chạy `drizzle-kit check`.
- `tests/migrations.test.mjs` kiểm tra migration trên DB rỗng và DB có dữ liệu cũ.
- **Chưa** áp dụng trên D1 của bản triển khai Sites.

### 4.4 Quy trình khuyến nghị

1. **Tạo D1 staging riêng** trên tài khoản Cloudflare của người phụ trách. Không dùng D1 production để thử.
2. Áp dụng `0000` → `0008` lên staging. Ghi lại mọi cảnh báo hoặc lỗi từ D1.
3. Chạy kiểm tra thủ công trên staging: đăng nhập quản trị lần đầu bằng `ADMIN_PASSWORD`, đổi mật khẩu bắt buộc, tạo và đặt lại tài khoản tình nguyện viên, khóa tạm sau 5 lần sai, đăng nhập tình nguyện viên và ghi phiếu, tiến độ hai thiết bị, trắc nghiệm, liên kết video, tải video nhỏ, báo cáo quản trị, xuất CSV.
4. Chạy kịch bản k6 trên staging theo mục 3.
5. Chỉ sau khi staging đạt mọi bước, lập kế hoạch áp dụng lên production, với phê duyệt của người giữ `OWNER_EMAIL`.
6. Sao lưu D1 và R2 trước khi áp dụng lên production: **[Cần bổ sung nguồn]** cách sao lưu D1 trên nền tảng Sites.

### 4.5 Cấu hình liên quan

- `vite.config.ts` khai báo binding D1 `site-creator-d1` và R2. Giá trị `database_id` đang là chỗ giữ chỗ; giá trị thật do nền tảng Sites cấp.
- Biến `OWNER_EMAIL`:
  - Trên Sites: đặt trong phần cài đặt bí mật của Sites (không đặt trong mã).
  - Cục bộ: đặt trong `.dev.vars` (không commit).
  - Chỉ người phụ trách được thay đổi giá trị này.
- Biến `ADMIN_PASSWORD`:
  - Trên Sites: đặt trong phần cài đặt bí mật của Sites, trước lần đăng nhập quản trị đầu tiên.
  - Cục bộ: đặt trong `.dev.vars`.
  - Chỉ dùng để tạo tài khoản quản trị ở lần đăng nhập đầu tiên. Sau đó đổi giá trị không đổi mật khẩu; đổi mật khẩu bằng trang tài khoản.
  - Giá trị phải đủ mạnh (tối thiểu 10 ký tự theo FR-AUTH-02). Đăng nhập ngay sau khi đặt, vì trước lần đầu chưa có tài khoản nên chưa có khóa tạm.
- `.env.example` và `.dev.vars.example` chỉ chứa tên biến, không chứa giá trị.

### 4.6 Sau khi triển khai

- Cấu hình gửi email khôi phục mật khẩu (FR-AUTH-11), đặt trong secret của Sites, không ghi giá trị vào mã hoặc tài liệu:
  - `RESEND_API_KEY`: khóa API của Resend (gói miễn phí: 100 email mỗi ngày, 3 000 mỗi tháng). Nếu thiếu, yêu cầu khôi phục trả 503.
  - `MAIL_FROM`: địa chỉ gửi thuộc tên miền đã xác minh trên Resend. **[Cần xác định: tên miền gửi của chủ website]**.
  - `APP_BASE_URL`: gốc https của trang, ví dụ `https://<địa-chỉ-trang>`, không có dấu `/` cuối. Liên kết trong email lấy từ biến này, không lấy từ header của yêu cầu.
- Kiểm tra đăng nhập, phân quyền, đồng bộ hai thiết bị trên bản triển khai.
- Kiểm tra cookie `st_session` trên Sites: HttpOnly, Secure, SameSite=Lax, và `Origin` với yêu cầu POST **[Cần xác minh]**.
- Kiểm tra báo cáo quản trị với dữ liệu thật.
- Theo dõi chi phí, lượng yêu cầu và dung lượng R2.

---

## 5. Danh sách việc cần làm trước khi vận hành thật

| # | Việc | Người phụ trách | Trạng thái |
|---|---|---|---|
| 1 | Tạo D1 staging riêng | Người giữ tài khoản Cloudflare | Chưa làm |
| 2 | Áp dụng `0000`–`0008` lên staging | Chủ website, có kiểm tra của Claude | Chờ bước 1 |
| 3 | Kiểm thử thủ công trên staging | Người điều phối | Chờ bước 2 |
| 4 | Chạy k6 trên staging (01:00–03:00 UTC+7) | Người chạy tải | Chờ bước 2 |
| 5 | Đánh giá rủi ro upload (giới hạn bộ nhớ, thời lượng do client gửi) | Chủ website | Mốc cải tiến sau |
| 6 | Chính sách dọn tệp R2 cũ | Chủ website | Mốc cải tiến sau |
| 7 | Xác minh thư mục `server-local/` | Người viết tài liệu kiến trúc | **[Cần xác minh]** |
| 8 | Quy trình sao lưu và khôi phục D1 | Chủ website | **[Cần bổ sung nguồn]** |
| 9 | Đặt `ADMIN_PASSWORD` trên Sites và đăng nhập đầu tiên | Chủ website | Chưa làm |
| 10 | Quy trình khôi phục khi quên mật khẩu (FR-AUTH-11) | Chủ website | Đã triển khai trong mã và kiểm thử bằng email giả, gồm giới hạn 10 yêu cầu mỗi IP mỗi giờ. **Chưa gửi thật:** cần tên miền gửi đã xác minh trên Resend và đặt `RESEND_API_KEY`, `MAIL_FROM`, `APP_BASE_URL` trên Sites. |
| 11 | Kiểm thử trình duyệt cho màn hình đăng nhập và đổi mật khẩu bắt buộc | Người điều phối | Chưa làm |
| 12 | Chạy `drizzle-kit check` và sinh snapshot `0006` | Người viết migration | Chưa làm |

---

## 6. Quản lý tài khoản quản trị và tình nguyện viên

### 6.1 Quy tắc (SRS mục 3.7, FR-AUTH-01 đến FR-AUTH-10)

- Mật khẩu từ 10 đến 200 ký tự khi tạo, đặt lại và đổi. Đăng nhập không kiểm tra độ dài.
- Sai 5 lần liên tiếp thì khóa tạm 15 phút (HTTP 423).
- Phiên hết hạn sau 12 giờ. Đổi mật khẩu, đặt lại hoặc vô hiệu hóa tài khoản sẽ đăng xuất các phiên liên quan.
- Tài khoản tình nguyện viên mới hoặc vừa được đặt lại mật khẩu phải đổi mật khẩu trước khi dùng chức năng khác.

### 6.2 Thao tác thường gặp

| Việc | Cách làm | Ghi chú |
|---|---|---|
| Đăng nhập quản trị lần đầu | Email là email chủ website; mật khẩu là giá trị `ADMIN_PASSWORD` | Sau đó đổi mật khẩu ngay trong trang tài khoản |
| Cấp quyền tình nguyện viên | Trang tài khoản: nhập email, họ tên, mật khẩu tạm | Gửi mật khẩu tạm cho tình nguyện viên qua kênh riêng, không qua email công khai hoặc nhóm chung |
| Đặt lại mật khẩu | Chọn tài khoản, nhập mật khẩu tạm mới | Phiên cũ bị đăng xuất; tài khoản đổi mật khẩu ở lần sau |
| Thu hồi quyền | Vô hiệu hóa tài khoản | Phiên đang mở bị đăng xuất; ghi phiếu bị từ chối |
| Mở lại tài khoản | Kích hoạt lại | Chỉ mở tài khoản đã vô hiệu hóa. Khóa tạm do sai mật khẩu tự hết sau 15 phút |

### 6.3 Sự cố thường gặp

- **Bị khóa 423:** chờ 15 phút, hoặc quản trị viên khác đặt lại mật khẩu tạm.
- **Quên mật khẩu quản trị:** chưa có quy trình đã kiểm chứng (mục 5, việc 10). Không đặt lại bằng cách sửa dữ liệu trực tiếp trong D1 nếu chưa có phê duyệt.
- **Lộ mật khẩu hoặc nghi lộ:** đặt lại mật khẩu ngay; nếu là `ADMIN_PASSWORD`, đổi giá trị trên Sites và đổi mật khẩu quản trị trong trang tài khoản.
