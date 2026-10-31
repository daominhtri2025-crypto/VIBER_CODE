# Hướng dẫn chạy Sơn Trà Số trên Windows

Tài liệu này dành cho người muốn chạy dự án trên máy Windows để phát triển, kiểm thử hoặc xem thử. Các lệnh dùng PowerShell. Đường dẫn trong tài liệu dùng dấu `\` của Windows.

> **Lưu ý quan trọng.** Các script `scripts\install-pnpm.sh` và `scripts\build-verified.sh` là bash và dành cho môi trường Linux của nền tảng. Trên Windows không dùng chúng. Tài liệu này dùng trực tiếp lệnh `pnpm`, `node` và `wrangler`.

---

## 1. Yêu cầu

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Windows | 10 hoặc 11 (64-bit) | |
| Node.js | 24 khuyến nghị; tối thiểu **22.13** | Tải từ trang chính thức của Node.js, chọn bản LTS |
| pnpm | **11.25.0** | Đúng phiên bản trong `package.json` (trường `packageManager`) |
| Git | Bản mới | Để clone và cập nhật mã |
| Kết nối Internet | | Để cài thư viện theo `pnpm-lock.yaml` |

Kiểm tra sau khi cài:

```powershell
node --version
npm --version
```

Kết quả Node phải từ `v22.13.0` trở lên.

---

## 2. Lấy mã nguồn

```powershell
cd $HOME\Documents
git clone https://github.com/daominhtri2025-crypto/VIBER_CODE.git viber_code
cd viber_code
git checkout Son_tra_so
```

Nhánh dùng để phát triển là `Son_tra_so`, không phải `main`.

---

## 3. Cài pnpm đúng phiên bản

```powershell
npm install -g pnpm@11.25.0
pnpm --version
```

Kết quả phải là `11.25.0`. Nếu lệnh `pnpm` không nhận diện sau khi cài, đóng và mở lại PowerShell.

---

> **Nếu PowerShell báo `running scripts is disabled`** (lỗi với `npm.ps1` hoặc `pnpm.ps1`), chạy một lần:
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
>
> Nhập `Y` khi được hỏi, rồi mở lại PowerShell. Có thể dùng `npm.cmd` và `pnpm.cmd` thay thế mà không đổi chính sách.

## 4. Cài thư viện

Trong thư mục dự án:

```powershell
pnpm install --frozen-lockfile
```

- `--frozen-lockfile` buộc pnpm dùng đúng phiên bản trong `pnpm-lock.yaml`. Nếu báo lỗi lockfile, **không** tự chạy `pnpm install` không có cờ này; hỏi người phụ trách trước.
- Lần cài đầu có thể mất vài phút.

---

## 5. Tạo tệp cấu hình cục bộ `.dev.vars`

Tệp `.dev.vars` chứa biến môi trường cho máy chủ cục bộ. **Tệp này không được commit lên Git** (đã có trong `.gitignore`).

```powershell
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
```

Nội dung cần có:

```
OWNER_EMAIL=seedy@sites.test
ADMIN_PASSWORD=<mật-khẩu-riêng-của-anh-tối-thiểu-10-ký-tự>
```

- `OWNER_EMAIL=seedy@sites.test` chỉ dùng cho đăng nhập mô phỏng trên máy cá nhân.
- `ADMIN_PASSWORD` là mật khẩu ban đầu của quản trị viên, chỉ dùng cho **lần đăng nhập đầu tiên**. Đặt giá trị riêng của anh, không dùng giá trị mẫu, không ghi vào mã hay tài liệu.
- Không dán `ADMIN_PASSWORD` vào trò chuyện hoặc commit.

Nếu muốn thử chức năng **quên mật khẩu** trên máy cá nhân, cần thêm ba biến (không bắt buộc cho các tính năng khác):

```
RESEND_API_KEY=<khóa-resend-của-anh>
MAIL_FROM="Sơn Trà Số <khong-tra-loi@<tên-miền-đã-xác-minh>>"
APP_BASE_URL=https://<địa-chỉ-https-của-anh>
```

Lưu ý:
- `APP_BASE_URL` phải là `https://`. Địa chỉ `http://localhost:5173` sẽ làm yêu cầu quên mật khẩu trả 503 do máy chủ từ chối cấu hình không hợp lệ.
- Khi chưa có tên miền đã xác minh, thư sẽ không gửi được tới người nhận thật. Đây là hành vi dự kiến.

---

## 6. Build để sinh cấu hình cơ sở dữ liệu cục bộ

```powershell
pnpm build
```

Lệnh này tạo thư mục `dist\server\` chứa `wrangler.json`. Các lệnh migration ở mục 7 dùng tệp này.

Sau khi build, kiểm tra tồn tại tệp:

```powershell
Test-Path dist\server\wrangler.json
```

Kết quả phải là `True`.

---

> **Lưu ý cho Windows.** Với lệnh `node --import`, dùng dấu `/` (ví dụ `./scripts/sites-env.mjs`), không dùng `.\`. Node coi chuỗi bắt đầu bằng `.\` là tên package và báo lỗi `ERR_INVALID_MODULE_SPECIFIER`.

## 7. Tạo cơ sở dữ liệu cục bộ và áp dụng đủ migration

Đây là bước dễ sai nhất. README cũ chỉ áp dụng `0000`, nhưng dự án hiện có **10 migration** (`0000` đến `0009`). Thiếu `0002` thì không có bài học nào và trang học trả lỗi 503.

Chạy một lần khi tạo cơ sở dữ liệu mới, theo đúng thứ tự:

```powershell
foreach ($migration in (Get-ChildItem drizzle\*.sql | Sort-Object Name)) {
  Write-Host "Áp dụng $($migration.Name)"
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist\server\wrangler.json --persist-to .wrangler\state --file $migration.FullName
  if ($LASTEXITCODE -ne 0) { Write-Host "LỖI ở $($migration.Name), dừng lại"; break }
}
```

Kiểm tra kết quả: lệnh phải in ra từng tệp `0000` đến `0009` và không có dòng `LỖI`.

> **Không chạy lại migration trên cơ sở dữ liệu đã có dữ liệu thật.** Nếu cần làm lại từ đầu, xóa thư mục `.wrangler\state` trên máy cá nhân trước (đây là dữ liệu cục bộ của anh, không phải dữ liệu thật của website). Việc xóa cần được anh xác nhận trước.

---

### Kiểm tra bảng bài học

Sau khi áp dụng đủ migration, đếm số bài trong cơ sở dữ liệu cục bộ:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist\server\wrangler.json --persist-to .wrangler\state --command "SELECT COUNT(*) AS so_bai FROM lessons"
```

Kết quả phải có `so_bai` bằng `10`. Nếu bằng `0`, migration `0002_seed_bai_hoc.sql` chưa được áp dụng; chạy lại vòng lặp ở trên.

## 8. Chạy ứng dụng

```powershell
pnpm dev
```

Mở trình duyệt tại địa chỉ hiển thị trên terminal, thường là `http://localhost:5173`.

| Đường dẫn | Nội dung |
|---|---|
| `/home.html` | Trang học |
| `/admin.html` | Trang điều phối (cần đăng nhập email và mật khẩu) |
| `/print.html` | Tài liệu in |
| `/signin-with-chatgpt?return_to=/home.html` | Đăng nhập học viên mô phỏng, danh tính mẫu `seedy@sites.test` |

Dừng ứng dụng bằng `Ctrl + C` trong terminal.

### Kiểm tra API trước khi mở trang

Khi `pnpm dev` đang chạy, mở trình duyệt tới:

`http://localhost:5173/api/lessons`

- Kết quả đúng: trang JSON có danh sách `lessons` với 10 bài.
- Kết quả `503` với thông báo "Chưa thể tải dữ liệu": máy chủ không đọc được cơ sở dữ liệu. Ghi lại dòng lỗi màu đỏ trong terminal đang chạy `pnpm dev` và gửi cho người phụ trách.

Trang `/home.html` chỉ hiển thị bài học khi địa chỉ `/api/lessons` trả về dữ liệu.

### Đăng nhập quản trị lần đầu

1. Mở `/admin.html`.
2. Email: giá trị `OWNER_EMAIL` trong `.dev.vars` (`seedy@sites.test`).
3. Mật khẩu: giá trị `ADMIN_PASSWORD` anh đã đặt.
4. Hệ thống yêu cầu đổi mật khẩu ngay lần đầu. Hãy đặt mật khẩu mới và ghi nhớ ở nơi an toàn.

Sau lần đầu, `ADMIN_PASSWORD` không còn tác dụng. Mật khẩu được đổi trong trang tài khoản hoặc bằng quy trình quên mật khẩu.

---

## 9. Chạy kiểm thử

Kiểm thử không gọi dịch vụ bên ngoài thật và không cần Cloudflare. Chạy toàn bộ:

```powershell
npm test
```

Kết quả đạt có dòng `PASS` cho từng bộ kiểm thử và thoát với mã 0. Kiểm tra mã thoát:

```powershell
npm test
echo "Mã thoát: $LASTEXITCODE"
```

Chạy riêng một bộ:

```powershell
node tests\password-reset.test.mjs
node tests\migrations.test.mjs
```

Kiểm tra kiểu TypeScript:

```powershell
pnpm exec tsc --noEmit
```

---

## 10. Cập nhật mã

```powershell
git pull origin Son_tra_so
pnpm install --frozen-lockfile
pnpm build
```

Nếu có migration mới trong `drizzle\`, áp dụng **chỉ các tệp mới** bằng lệnh ở mục 7 (đổi điều kiện lọc tên tệp cho phù hợp), không chạy lại tệp cũ.

---

## 11. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `pnpm` không được nhận diện | Terminal mở trước khi cài | Đóng và mở lại PowerShell |
| Lỗi `frozen-lockfile` | `pnpm-lock.yaml` không khớp `package.json` | Kiểm tra đúng nhánh `Son_tra_so`; không tự chạy `pnpm install` không có cờ |
| Trang học báo "Chưa tải được bài học" (503) | Chưa áp dụng đủ migration, thiếu `0002` | Chạy lại mục 7 cho các tệp còn thiếu |
| Lệnh `wrangler` báo không tìm thấy `dist\server\wrangler.json` | Chưa build | Chạy `pnpm build` (mục 6) |
| Quên mật khẩu trả 503 | Thiếu `RESEND_API_KEY`, `MAIL_FROM`, hoặc `APP_BASE_URL` không phải https | Xem ghi chú ở mục 5 |
| Cổng 5173 đã bị chiếm | Ứng dụng khác đang dùng cổng | Đóng ứng dụng đó, hoặc đổi cổng trong cấu hình Vite |
| Lỗi `EPERM` hoặc `EBUSY` khi cài hoặc build | Antivirus hoặc Windows Defender đang quét thư mục | Tạm loại trừ thư mục dự án khỏi quét thời gian thực |
| Lỗi `running scripts is disabled` khi chạy `npm` hoặc `pnpm` | Chính sách thực thi PowerShell | Xem ghi chú trong mục 3; hoặc dùng `npm.cmd`, `pnpm.cmd` |
| Lỗi `ERR_INVALID_MODULE_SPECIFIER` khi chạy migration | Dùng `.\` trong `node --import` | Dùng `./scripts/sites-env.mjs` (xem mục 7) |
| `/api/lessons` trả 503 dù migration đã chạy xong | Chưa rõ; máy chủ `pnpm dev` có thể đọc kho D1 khác với kho đã migrate | Xem mục "Kiểm tra API" ở mục 8; gửi dòng lỗi đỏ trong terminal `pnpm dev` |
| Lỗi đường dẫn quá dài | Giới hạn đường dẫn của Windows | Bật đường dẫn dài trong Windows hoặc đặt dự án ở thư mục ngắn, ví dụ `C:\dev\viber_code` |
| `ADMIN_PASSWORD` không hoạt động | Tài khoản quản trị đã được tạo ở lần đăng nhập trước | Đăng nhập bằng mật khẩu đã đổi; `ADMIN_PASSWORD` không còn tác dụng |

---

## 12. Những việc không nên làm

- Không commit `.dev.vars`, `.env`, `.wrangler\`, hoặc bất kỳ tệp nào chứa khóa API, mật khẩu thật.
- Không đưa khóa API hoặc mật khẩu vào trò chuyện, tài liệu, hay nhật ký.
- Không chạy migration trên cơ sở dữ liệu của website đang hoạt động từ máy cá nhân.
- Không đổi máy chủ cục bộ sang lắng nghe `0.0.0.0` để phơi ra mạng. Ứng dụng chỉ nên chạy trên `127.0.0.1` như thiết kế.
- Không chỉnh `OWNER_EMAIL` trong mã nguồn; giá trị này do người phụ trách đặt.

---

## 13. Tài liệu liên quan

- `README.md`: tổng quan dự án.
- `docs/HUONG_DAN_VAN_HANH_VA_CHUYEN_GIAO.md`: vận hành và triển khai lên Sites.
- `docs/KIEN_TRUC_VA_BAN_GIAO.md`: kiến trúc và hiện trạng.
- `SRS_Son_Tra_So.md`: yêu cầu chức năng và phi chức năng.
- `CLAUDE.md`: quy tắc làm việc trong dự án.
