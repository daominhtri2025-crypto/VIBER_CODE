# Sơn Trà Số — Mã nguồn website

Nền tảng học và thực hành kỹ năng số cơ bản cho người dân phường Sơn Trà.
Gói bàn giao từ mã nguồn phiên bản triển khai `d97887299c4faab9fbb345c2b4a1af9341c54b12`.

## Có trong gói
- 10 bài học thuộc 5 chủ đề, hướng dẫn bằng chữ và giọng đọc trên trình duyệt.
- 15 tình huống an toàn số, thực hành biểu mẫu, sổ tay và 11 mã QR.
- Đăng nhập ChatGPT trên môi trường Sites, đồng bộ tiến độ nhiều thiết bị.
- Dashboard tự làm mới mỗi 15 giây; đánh giá quan sát trước–sau và xuất CSV.
- Phân quyền người học, tình nguyện viên, chủ website.
- Tải video MP4/WebM dưới 2 phút, tối đa 25 MB vào kho R2.

## Yêu cầu
- Node.js 24 được khuyến nghị (ứng dụng yêu cầu tối thiểu 22.13).
- pnpm đúng phiên bản `11.25.0`, theo trường packageManager trong package.json.
- Môi trường Cloudflare Workers với D1/R2; dự án dùng Vinext, React và Drizzle.
- Kết nối Internet để cài các thư viện theo pnpm-lock.yaml.

## Chạy trên máy cá nhân
Mở terminal tại thư mục chứa package.json:

```sh
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
```

Sao chép `.dev.vars.example` thành `.dev.vars`. Giá trị `OWNER_EMAIL=seedy@sites.test` chỉ dành cho đăng nhập mô phỏng trên máy cá nhân.

Build một lần để sinh cấu hình D1 cục bộ:

```sh
pnpm build
```

Áp dụng migration vào cơ sở dữ liệu cục bộ (chỉ chạy lần đầu trên cơ sở dữ liệu mới):

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_fancy_rogue.sql
```

Chạy ứng dụng:

```sh
pnpm dev
```

Mở địa chỉ terminal thông báo, thường là `http://localhost:5173`.
- `/home.html`: website học tập.
- `/admin.html`: giao diện quản trị.
- `/print.html`: tài liệu in.
- `/signin-with-chatgpt?return_to=/admin.html`: đăng nhập mô phỏng trên máy cá nhân; danh tính mẫu là `seedy@sites.test`.

Môi trường cục bộ và dữ liệu thật tách biệt. Không phát máy chủ mô phỏng đăng nhập ra Internet. Tệp `.sites-runtime/execution-profile.json` đã được loại khỏi gói; bản giải nén mặc định dùng profile portable.

## Kiểm tra mã nguồn

```sh
node tests/api.test.mjs
pnpm exec tsc --noEmit
pnpm build
```

Bài kiểm tra API dùng SQLite trong bộ nhớ và kiểm tra xác thực, chống yêu cầu khác nguồn, tách dữ liệu giữa tài khoản, hợp nhất tiến độ, phân quyền, cấp/thu hồi quyền đánh giá. Đây không phải kiểm thử tải hoặc kiểm thử toàn bộ luồng đăng nhập thật trên trình duyệt.

## Triển khai
Bản nguồn này dùng cơ chế xác thực của Sites. Các đường dẫn đăng nhập và danh tính người dùng được nền tảng cung cấp; không có máy chủ OAuth độc lập trong gói.

1. Tạo hoặc chọn dự án Sites đích. Gói xuất đã bỏ project_id để tránh vô tình cập nhật website đang hoạt động; gắn ID do nền tảng cấp cho dự án đích vào `.openai/hosting.json`.
2. Giữ binding D1 `DB`, binding R2 `BUCKET`, cấu hình bí mật `OWNER_EMAIL` bằng email của tài khoản chủ dự án đích.
3. Build và áp dụng migration qua quy trình triển khai Sites. Không chạy lại migration cũ trên cơ sở dữ liệu đã có.
4. Kiểm tra quyền, đăng nhập, đồng bộ hai thiết bị và tải video trước khi phát mã QR.
5. Nếu dùng tên miền khác, tạo lại 11 QR trong `public/qr/`; QR đi kèm hiện trỏ về website Sơn Trà Số đang triển khai.

Chạy độc lập trên Cloudflare/Vercel hoặc máy chủ khác cần bổ sung/thay thế cơ chế xác thực và cấu hình lưu trữ. Không tin các header `oai-authenticated-user-*` từ Internet nếu không có lớp xác thực đáng tin cậy phía trước.

## Dữ liệu và giới hạn
- Gói không có dữ liệu người học, tài khoản, cơ sở dữ liệu thật, video đã tải lên, mật khẩu hoặc khóa bí mật.
- Chưa có video quay thực tế kèm theo; quản trị viên tải lên tại `/admin.html`.
- Dashboard cập nhật theo chu kỳ 15 giây, không dùng WebSocket.
- Xem bài không cần tài khoản; đồng bộ cần đăng nhập ChatGPT.
- Kết quả tự đánh dấu tách biệt với đánh giá quan sát của tình nguyện viên.
- Bản triển khai đã build và kiểm tra logic API. Luồng đăng nhập thật trên trình duyệt, hiệu năng nhiều người đồng thời và thử nghiệm hiện trường cần được xác nhận trước khi sử dụng rộng.
- Giữ giấy phép trong `build/` khi phân phối thành phần tương ứng.

Đọc `docs/KIEN_TRUC_VA_BAN_GIAO.md` để tiếp tục phát triển.
