# Báo cáo nghiệm thu Giai đoạn 4: Giao diện và nghiệm thu end-to-end

**Ngày:** 14/10/2026
**Nguồn chuẩn:** `docs/PROJECT_HANDOFF.md` §7 GĐ4, cùng các quyết định ngày 14/10/2026: Next.js App Router, nhận diện thương hiệu nhẹ, bàn phím ký hiệu ảo kèm xem trước KaTeX, đóng gói Docker.

**Môi trường kiểm thử:**
- Next.js 16.3.6, React 19.3.0, TypeScript 5.9.3, Tailwind 4.3.3, KaTeX 0.18.9.
- Vitest 4.1.11, Playwright 1.56.1 chạy Chromium.
- Backend như Giai đoạn 3 (AI ở chế độ giả lập).

**Giới hạn của lần kiểm thử này:**
- Máy kiểm thử **không có Docker daemon**, nên các Dockerfile **chưa được build thật**. Tôi chỉ chạy thử theo cách tương đương container (mục 5).
- Chưa thử trên Safari/iOS hay Windows.
- Chưa làm thử nghiệm quan sát với giáo viên và học sinh thật (§7 GĐ4 bước 7).

## 1. Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| Unit test frontend (xem trước công thức, bàn phím ảo, chặn chèn lệnh LaTeX) | **16/16** |
| Kịch bản end-to-end Playwright (4 vai trò, một lần chạy trên điện thoại, đổi mật khẩu lần đầu) | **7/7** |
| Backend `pytest` | **892 passed**. Bổ sung: endpoint danh sách, chặn bài thiếu danh mục khi giao chế độ có hướng dẫn, kiểm tra phương trình khi soạn bài, lệnh tạo admin |
| `tsc --noEmit` và `next build` | Sạch. 20 route |
| Chạy thử bản standalone (đóng vai container) | Trang `/login` 200, CSS 200, đăng nhập qua BFF hoạt động, chặn CSRF hoạt động |

## 2. Thiết kế giao diện: chủ đề "vở ô li"

Mục tiêu là giao diện học tập tối giản, sạch. Hình ảnh lấy từ quyển **vở ô li** quen thuộc của học sinh Việt Nam:

- Mặt giấy trắng lạnh, ô vuông 24 px màu xanh nhạt, có đường kẻ lề đỏ.
- Mỗi bước giải là một dòng viết bằng **mực xanh**.
- Dấu ✗ màu **bút đỏ** của giáo viên đánh dấu bước sai. Dấu ✓ màu xanh lá đánh dấu bước đúng.
- Gợi ý hiện trên nền màu **bút dạ quang**.
- Phông chữ **Be Vietnam Pro**, được thiết kế riêng cho dấu tiếng Việt và tự host qua npm (không cần mạng khi build).
- Chỉ có **một hiệu ứng chuyển động**: dấu ✓/✗ "đóng" lên dòng vừa chấm. Hiệu ứng tự tắt khi thiết bị bật chế độ giảm chuyển động.
- **Thương hiệu:** tên sản phẩm, tên tổ chức (mặc định Minh Trí Academy) và logo cấu hình được qua biến `NEXT_PUBLIC_*`. Gói phần mềm **không kèm logo của bên thứ ba**. Logo FPT Polytechnic nếu dùng cần nhà trường cung cấp file đã được phép sử dụng.

## 3. Các màn hình

| Vai trò | Route | Chức năng |
|---|---|---|
| Học sinh | `/hoc` | Bài được giao, bài kiểm tra, lịch sử làm bài |
| | `/hoc/phien/[id]` | **Không gian giải bài**: thanh 6 bước, trang vở chứa các bước đã viết, ô trợ lý (phản hồi, câu hỏi, gợi ý, dòng công bố AI, nút báo phản hồi sai), khung nhập theo từng trạng thái |
| | `/hoc/kiem-tra/[id]` | Bài kiểm tra độc lập: lưu nháp, nộp, xem kết quả sau khi công bố |
| Giáo viên | `/giao-vien` | Danh sách lớp, tạo lớp |
| | `/giao-vien/lop/[id]` | Tiến trình từng học sinh: số lần thử, số bước sai, số gợi ý xin và tổng, mức gợi ý cao nhất, thời gian học, cờ "cần hỗ trợ". Kèm thống kê lỗi thường gặp, giao bài, thêm học sinh. |
| | `/giao-vien/phien/[id]` | Toàn bộ các lần thử (cả bước sai) và đối thoại |
| | `/giao-vien/ngan-hang` | Soạn bài bằng bàn phím ảo, duyệt bài |
| | `/giao-vien/phan-hoi` | Xử lý phản hồi bị học sinh báo |
| | `/giao-vien/tai-khoan` | Tạo tài khoản học sinh |
| Nghiên cứu | `/nghien-cuu`, `/nghien-cuu/dot/[id]` | Đợt, nhóm, người tham gia, đề trước/sau có cửa sổ thời gian, **chấm mù**, công bố kết quả, tải 2 file CSV, gửi yêu cầu xóa dữ liệu |
| Quản trị | `/quan-tri` | Tài khoản và vai trò, khóa/mở tài khoản, cấu hình AI và thống kê sử dụng 7 ngày, duyệt và thực hiện xóa dữ liệu (phải gõ "XOA" để xác nhận) |

**Ô nhập phương trình** (theo quyết định ngày 14/10/2026):
- Gồm ô văn bản, nút "Phím Toán" (x + − × : = ( ) a/b xⁿ , ⌫ và các chữ số 0–9) và bản xem trước KaTeX cập nhật ngay khi gõ.
- Khi bàn phím ảo đang mở, ô nhập dùng `inputMode="none"` để bàn phím của điện thoại không che màn hình.
- Phần xem trước cảnh báo theo đúng quy tắc của parser phía server: `2.5` (yêu cầu dùng dấu phẩy), `x²` (yêu cầu dùng phím ^), nhiều dấu `=`, chữ khác x, thiếu ngoặc.
- Phần xem trước chỉ để hiển thị. **Đúng/sai vẫn do MathChecker ở server quyết định.**

## 4. Bảo mật phía web

- **Mô hình BFF (backend-for-frontend):** trình duyệt **không bao giờ nhận JWT**.
  - Access token và refresh token nằm trong cookie `httpOnly; SameSite=Lax`. Refresh token chỉ gửi kèm các đường dẫn `/bff`.
  - Mọi lời gọi API đi qua `/bff/api/*`. Route này tự gắn header `Authorization` và tự refresh token một lần khi gặp lỗi 401.
- **Chống CSRF:** request ghi dữ liệu phải có header `x-mt-client: web`, bổ sung cho `SameSite`. Đường dẫn được kiểm tra theo whitelist, không cho `..`.
- **HTTP header:** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Server API thêm `Cache-Control: no-store`.
- **KaTeX** chạy với `trust:false`. Có unit test chứng minh chuỗi `\href{javascript:…}` không lọt vào kết quả hiển thị.
- **Retry:** mỗi thao tác giữ nguyên `request_id` khi gửi lại cùng nội dung, và đổi id mới khi học sinh sửa nội dung. Khi gặp lỗi `VERSION_CONFLICT`, trang tự tải lại trạng thái mới nhất.

## 5. Đóng gói Docker

| File | Nội dung |
|---|---|
| `api/Dockerfile` | python:3.12-slim, chạy bằng user thường. Mỗi lần khởi động: tạo database nếu chưa có, chạy migration (có backup trước), rồi chạy uvicorn. Có healthcheck. |
| `web/Dockerfile` | Build 3 tầng, dùng Next standalone, chạy bằng user thường |
| `docker-compose.yml` | 3 dịch vụ: `api` (không mở cổng ra ngoài), `web` (cổng 3000), `backup` (backup mã hóa và dọn bản cũ mỗi ngày). 3 volume: `db`, `backups`, `ops`. |
| `.env.docker.example`, `docs/DEPLOYMENT.md` | Hướng dẫn vận hành, gồm lệnh `create-admin` cho lần cài đặt đầu |

**Đã xác minh:** tôi chạy đúng các lệnh `CMD` của hai image trực tiếp trên máy (database rỗng, migration lên v5, server standalone gọi API qua BFF), và mọi thứ hoạt động.

**Chưa xác minh:** việc `docker build` thật, do máy không có Docker daemon. Cần chạy `docker compose up --build` trên máy chủ thí điểm. Tag base image đang để theo dòng phiên bản (`python:3.12-slim-bookworm`, `node:22-bookworm-slim`); nên ghim theo digest sau lần build đầu tiên.

## 6. Checklist nghiệm thu (Handoff §7, Giai đoạn 4)

| Tiêu chí | Đạt | Bằng chứng |
|---|---|---|
| Giáo viên tạo, duyệt, giao bài; học sinh nhận đúng bài | ✅ | E2E "teacher writes, approves and assigns…". Có thêm kiểm tra: chọn chế độ có hướng dẫn cho bài chưa có danh mục thì hệ thống báo lỗi 422 |
| Học sinh nhập sai, nhận gợi mở, tự sửa, kiểm tra nghiệm | ✅ | E2E "student solves 2x + 5 = 17…": nhập `2x=22` bằng bàn phím ảo, nhận lỗi dấu, xin gợi ý, sửa đúng, thay nghiệm |
| Làm bài mới không có hỗ trợ, nộp và xem kết quả được công bố | ✅ | Phần tự luyện trong cùng E2E (không có nút gợi ý, không hiện đúng/sai). Bài kiểm tra trong E2E researcher: nộp, chấm, công bố, học sinh thấy 9,5 điểm |
| Giáo viên xem đúng lịch sử, người nghiên cứu chấm và xuất đúng đợt | ✅ | E2E giáo viên xem từng bước; E2E researcher chấm mù và tải CSV không chứa tên |
| Tải lại trang hoặc mất mạng không mất bước, không tạo gợi ý trùng | ✅ / ⚠️ | E2E "reload keeps the session state". Phần retry dùng chung `request_id` đã được kiểm ở test API (GĐ3). **Chưa có E2E giả lập mất mạng.** |
| Chạy được trên điện thoại và máy tính | ✅ | E2E viewport 390 px: không có thanh cuộn ngang, `inputMode=none` khi mở bàn phím ảo. Ảnh chụp đã được rà lại. |
| Bổ sung: xóa dữ liệu theo quy tắc hai người qua giao diện | ✅ | E2E admin: người nghiên cứu gửi yêu cầu, admin duyệt, gõ "XOA" để xác nhận, sau đó học sinh A không còn lịch sử làm bài |

## 7. Phát hiện và sửa trong giai đoạn này

1. **Bài mới soạn trên giao diện không chạy được ở chế độ có hướng dẫn**, vì danh mục kiến thức và hướng giải (Q6) đang là file trong `content/`. Đã thêm kiểm tra: API trả lỗi 422 kèm thông báo rõ ràng, và giao diện hướng dẫn giáo viên dùng chế độ luyện tập cho bài mới. **Việc còn mở:** cần trình soạn danh mục, có quy trình duyệt và checksum.
2. **Giáo viên có thể soạn phương trình mà MathChecker không đọc được.** Đã thêm kiểm tra ngay khi soạn bài (ví dụ `x^2`, `2x+`).
3. **Cài đặt mới không có tài khoản nào để đăng nhập.** Đã thêm lệnh `create-admin`, yêu cầu mật khẩu tối thiểu 12 ký tự.
5. **Tài khoản mới vẫn dùng mật khẩu do người khác cấp.** Đã thêm màn hình bắt buộc đổi mật khẩu ở lần đăng nhập đầu, có E2E kiểm tra.
4. **Khi rà ảnh chụp giao diện:** bấm "Xin gợi ý" làm mất phản hồi của bước vừa sai; trên điện thoại, ô trợ lý nằm dưới khung nhập. Đã sửa: giữ phản hồi hiển thị cạnh gợi ý, và đặt ô trợ lý giữa trang vở và khung nhập khi xem trên điện thoại.

## 8. Rủi ro và phần còn lại

- **Trước thí điểm, cần làm:**
  - Build Docker thật.
  - Chạy với HTTPS và đặt `COOKIE_SECURE=true`.
  - Cấu hình reverse proxy có giới hạn tần suất truy cập.
  - Chạy thử với Claude API thật.
  - Giáo viên duyệt toàn bộ nội dung trong `content/`.
- Chưa có trình soạn danh mục kiến thức và hướng giải (mục 7.1).
- Chưa kiểm định accessibility bằng công cụ tự động (axe). Các phần đã làm thủ công: nhãn cho mọi ô nhập, viền focus rõ, `aria-live` cho phản hồi, `aria-current` cho bước hiện tại, vùng bấm tối thiểu 44 px.
- Giao diện chưa chặn route theo vai trò: học sinh mở `/quan-tri` sẽ thấy thông báo lỗi 403 do API trả về. Dữ liệu vẫn an toàn vì server kiểm tra quyền.
- Chưa làm thử nghiệm quan sát với giáo viên và học sinh thật (§7 GĐ4 bước 7).
