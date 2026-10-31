# Biên bản bàn giao — Sơn Trà Số (phiên bản hiện tại)

| Mục | Nội dung |
|---|---|
| Nhánh | `Son_tra_so` |
| Commit bàn giao | `6a2a2c6` (đã push lên `origin/Son_tra_so`) |
| Ngày lập | 31/10/2026 |
| Bên giao | [Cần bổ sung] |
| Bên nhận | [Cần bổ sung] |

Ghi chú về cách ghi nhận: mỗi kết quả có bằng chứng kiểm chứng được ghi trong cột "Bằng chứng". Mục chưa làm được đánh dấu rõ, không ghi là đã đạt.

## A. Mã nguồn và cấu hình

| # | Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| A1 | Mã nguồn đã đẩy lên nhánh `Son_tra_so` | Đạt | Commit `6a2a2c6` (mã nguồn và schema) và commit tài liệu bàn giao kế tiếp; cả hai đã push |
| A2 | Không có tệp nhạy cảm được theo dõi (`.env`, `.dev.vars`, `local-data/`, `.wrangler/`, khóa) | Đạt | Rà soát `git ls-files` ngày 31/10/2026; chỉ có `.env.example` chứa tên biến, không có giá trị |
| A3 | Không có bí mật trong mã và tài liệu | Đạt, có ghi chú | Quét mẫu khóa API và mật khẩu: không tìm thấy giá trị thật. Mẫu `ADMIN_PASSWORD=` trong `docs/HUONG_DAN_CHAY_TREN_WINDOWS.md` là chuỗi giữ chỗ; nên thay bằng `<mật khẩu tạm>` cho rõ |
| A4 | `SHA256SUMS.txt` khớp các tệp đã theo dõi | Đạt tại commit tài liệu bàn giao | `sha256sum -c SHA256SUMS.txt` không lỗi. Phạm vi: mọi tệp git theo dõi, trừ `CLAUDE.md`, `DAC_TA_…`, `SRS_…` và chính tệp này. Phải tạo lại sau mọi thay đổi tệp đã theo dõi |
| A5 | Địa chỉ remote | Cần xử lý | Git báo kho đã chuyển sang `daominhtri2025-crypto/VIBER_CODE`. Remote hiện vẫn là `viber_code` (push vẫn thành công qua chuyển hướng) |

## B. Cơ sở dữ liệu và migration

| # | Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| B1 | Migration `0000`–`0011` có trong repo | Đạt | `drizzle/` và `drizzle/meta/_journal.json` (12 mục) |
| B2 | Migration chạy được trên DB rỗng và DB có dữ liệu | Đạt trên SQLite | `tests/migrations.test.mjs`, `tests/lessons-admin.test.mjs` |
| B3 | Migration trên Cloudflare D1 thật | Chưa làm | Xem mục D1 staging ở `docs/HUONG_DAN_VAN_HANH_VA_CHUYEN_GIAO.md` mục 5 |
| B4 | `db/schema.ts` khớp migration 0006–0011 | Đạt | Snapshot dựng theo từng bước; bước 5 cho "No schema changes" so với snapshot 0005; schema cuối cho "No schema changes" so với chuỗi đầy đủ |
| B5 | Chuỗi snapshot `drizzle/meta/0000`–`0011` | Đạt, có ghi chú | `drizzle-kit check`: "Everything's fine". Snapshot 0006–0010 là dựng lại, không phải snapshot gốc. Các CHECK không tên trong migration 0006–0008 được ghi thành CHECK có tên; ngữ nghĩa giống nhau |
| B6 | Migration 0011 nằm ngoài kế hoạch đã duyệt | Đã ghi nhận | Lý do và cách khôi phục ghi trong `HUONG_DAN` mục 4.2 |

## C. Tài liệu

| # | Tài liệu | Trạng thái |
|---|---|---|
| C1 | `SRS_Son_Tra_So.md` (phiên bản 1.4) | Đã cập nhật: mục 3.9 quản lý bài học (FR-LES-01 đến 09), mục 4.1 |
| C2 | `docs/KIEN_TRUC_VA_BAN_GIAO.md` | Đã cập nhật: endpoint bài học, tin tức, quiz; mục xác thực và phiên; nợ kỹ thuật |
| C3 | `docs/HUONG_DAN_VAN_HANH_VA_CHUYEN_GIAO.md` | Đã cập nhật: bảng migration, mục 7 (quản lý bài học), mục 8 (báo cáo và CSV) |
| C4 | `docs/HUONG_DAN_CHAY_TREN_WINDOWS.md` | Có, chưa rà soát lại trong đợt này. Cần người chạy thử trên máy thật xác nhận |
| C5 | `CLAUDE.md` quy tắc mục 4 (mục 17: ngưỡng 70%) | Đã cập nhật theo phê duyệt trong phiên thiết kế |
| C6 | Thống nhất mã lỗi 409 cho `FR-LRN-07` | Còn mở, ghi trong SRS |

## D. Kiểm thử

| # | Bộ kiểm thử | Kết quả | Ghi chú |
|---|---|---|---|
| D1 | `npm test` (22 tệp kiểm thử trong chuỗi) | 27 nhóm PASS, thoát 0 | Chạy ngày 31/10/2026 |
| D2 | `tests/admin-page-browser.mjs` (360 px, bộ lọc, CSV, tổng quan) | 11/11 PASS | Chạy thủ công, cần Playwright. Chưa nằm trong `npm test` |
| D3 | Giao diện quản lý bài học (thêm, sửa, phân trang, lịch sử, 360 px, không lỗi console) | 9/9 PASS | Kiểm thử tạm bằng API giả lập, không nằm trong repo |
| D4 | Màn hình đăng nhập và đổi mật khẩu bắt buộc trên trình duyệt | Chưa làm | Mục 5, việc 11 trong `HUONG_DAN` |
| D5 | Kiểm tra tĩnh chống XSS | Đạt một phần | Mã quản trị mới dùng `textContent`; kiểm thử tĩnh trong `tests/admin-page.test.mjs`. Trang học còn `innerHTML` (mục E4) |
| D6 | Tải và hiệu năng trên D1 thật | Chưa làm | Mục 3 của `HUONG_DAN` (k6 trên staging) |

## E. Bảo mật

| # | Biện pháp | Trạng thái | Nguồn |
|---|---|---|---|
| E1 | Mật khẩu băm PBKDF2-SHA256, 100 000 vòng | Đạt | `shared/password-hash.ts` |
| E2 | Phiên: mã 256 bit, chỉ lưu băm SHA-256, cookie `HttpOnly; Secure; SameSite=Lax` | Đạt | `shared/auth-service.ts`, `app/api/[...path]/route.ts` |
| E3 | Khóa tạm 5 lần sai, 15 phút, 423 | Đạt | `shared/auth-rules.ts` |
| E4 | `innerHTML` trong mã phát hành | Còn mở | `public/app.js` (nội suy qua `esc()`), `public/admin.js` (chuỗi cố định), `public/home-service-art.js` (SVG cố định). Xem nợ kỹ thuật trong `KIEN_TRUC` |
| E5 | Giới hạn yêu cầu quên mật khẩu | Đạt | 3 mỗi tài khoản mỗi giờ; 10 mỗi IP mỗi giờ |
| E6 | Kiểm tra `Origin` cho mọi POST | Đạt | `app/api/[...path]/route.ts` |
| E7 | Mật khẩu quản trị ban đầu | Chưa làm | Đặt `ADMIN_PASSWORD` trong secret của Sites trước lần đăng nhập đầu. Giá trị không được ghi vào bất kỳ tệp nào (mục 5, việc 9 của `HUONG_DAN`) |

## F. Lưu ý vận hành cho bên tiếp nhận

1. **Mật khẩu quản trị ban đầu.** Đặt `ADMIN_PASSWORD` làm secret của Sites. Tài khoản quản trị chỉ được tạo ở lần đăng nhập đầu tiên, sau đó biến này bị bỏ qua. Đổi mật khẩu trong ứng dụng ngay sau khi đăng nhập. Không ghi giá trị vào tài liệu, nhật ký hay ảnh chụp màn hình.
2. **Quy tắc bài học ẩn/hiện.** Ẩn không xóa bài. Bài ẩn không hiện với học viên và không nhận lượt làm hoặc hoàn thành (409). Số liệu lịch sử giữ nguyên; báo cáo ghi "(đã ẩn)". Dropdown video chỉ có bài đang hiện; video đã gắn vào bài ẩn vẫn tồn tại và hiển thị nhãn "Bài N".
3. **Mã bài là khóa ổn định.** Không đổi mã bài đã có. Tiến độ và lượt làm bài trỏ theo mã.
4. **Email khôi phục mật khẩu** chưa gửi thật cho đến khi có tên miền Resend đã xác minh. Khi thiếu cấu hình gửi email, API trả 503. Phản hồi của luồng quên mật khẩu vẫn giống hệt dù email có tồn tại hay không.
5. **Ngưỡng 70%** tính trên số bài đang hiện; tử số là số bài có ít nhất một lượt đúng.

## G. Việc còn mở

| # | Việc | Người phụ trách | Trạng thái |
|---|---|---|---|
| G1 | Tạo D1 staging và áp dụng `0000`–`0011` | Người giữ tài khoản Cloudflare | Chưa làm |
| G2 | Đặt `ADMIN_PASSWORD` trên Sites và đăng nhập đầu | Chủ website | Chưa làm |
| G3 | Quy trình sao lưu và khôi phục D1 | Chủ website | [Cần bổ sung nguồn] |
| G4 | Tên miền Resend đã xác minh | Chủ website | Chưa làm |
| G5 | Chuyển `public/app.js` sang DOM API (nợ `innerHTML`) | Người phát triển | Đề xuất, cần phê duyệt trước khi làm |
| G6 | Đưa `admin-page-browser.mjs` vào `npm test` | Người phát triển | Cần quyết định |
| G7 | Xác nhận thứ tự hiển thị bài (hiện theo mã bài) | Chủ website | [Cần xác nhận] |
| G8 | Cập nhật địa chỉ remote | Người phát triển | Cần quyết định |
| G9 | Xác minh thư mục `server-local/` | Người viết tài liệu kiến trúc | [Cần xác minh] |

## H. Đào tạo và chuyển giao sử dụng

Biên bản này không ghi nhận buổi đào tạo nào đã diễn ra. Các bước dưới đây là kịch bản để người đào tạo thực hiện trên môi trường staging, không phải kết quả.

| Bước | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập quản trị lần đầu, đổi mật khẩu | Vào được trang quản trị sau khi đổi mật khẩu |
| 2 | Tạo tài khoản tình nguyện viên; đặt lại mật khẩu tạm | Tình nguyện viên đổi mật khẩu ở lần đăng nhập đầu; chỉ ghi được phiếu quan sát |
| 3 | Đăng tin tức; ẩn và hiện tin | Tin ẩn không hiện ở trang chủ |
| 4 | Thêm bài; sửa bài; xem lịch sử; ẩn bài | Bản trước xuất hiện trong lịch sử; bài ẩn không hiện với học viên |
| 5 | Mở báo cáo; lọc theo khoảng ngày; xuất CSV | Số liệu khớp bộ lọc; CSV mở đúng tiếng Việt |
| 6 | Ghi một phiếu quan sát | Phiếu lưu trên máy chủ; gửi lại cùng mã không tạo phiếu mới |

Sổ ký nhận:

| Vai trò | Họ tên | Ngày | Chữ ký |
|---|---|---|---|
| Bên giao | [Cần bổ sung] | [Cần bổ sung] | [Cần bổ sung] |
| Bên nhận | [Cần bổ sung] | [Cần bổ sung] | [Cần bổ sung] |
| Người đào tạo | [Cần bổ sung] | [Cần bổ sung] | [Cần bổ sung] |
