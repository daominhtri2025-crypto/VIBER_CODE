# ADR-006 — Luồng xác thực (đăng ký, đăng nhập, đăng xuất)
Status: accepted (07/10/2026, TASK-005).

## Bối cảnh
Next.js 16 đổi `middleware` thành `proxy` và khuyến nghị chỉ dùng proxy cho kiểm tra lạc quan; kiểm tra quyền thật đặt gần dữ liệu (Data Access Layer). Supabase SSR dùng cookie và luồng PKCE. Q08 (đã chốt): bắt buộc xác thực email.

## Quyết định
1. **Proxy** (`src/proxy.ts` → `src/lib/supabase/proxy.ts`) chỉ làm mới session (`getClaims()`) và ghi cookie; không redirect phân quyền.
2. **DAL** `getCurrentUser()` (`src/features/auth/session.ts`): xác minh bằng `getClaims()`, không dùng `getSession()`; `React.cache` trong một lần render; trả DTO `{ id, email, displayName }`. Trang cần đăng nhập gọi DAL rồi `redirect('/login?next=…')`.
3. **Server actions** `signUp`, `signIn`, `signOut` (`src/features/auth/actions.ts`); form `useActionState`; validate tại server (`validation.ts`); giữ dữ liệu form trừ mật khẩu khi lỗi.
4. **Xác thực email**: bật cả ở local (`enable_confirmations = true`) để giống production. Link email → GoTrue `/verify` → `/auth/callback?code=…` → `exchangeCodeForSession` (PKCE; code verifier nằm trong cookie của trình duyệt đã đăng ký). Mở link ở trình duyệt khác: email vẫn được xác thực, người dùng được hướng dẫn đăng nhập.
5. **Thông điệp trung tính**: sai mật khẩu và email không tồn tại cùng một thông điệp; đăng ký bằng email đã tồn tại hiển thị cùng màn hình "Kiểm tra hộp thư".
6. **`next` an toàn**: `safeNextPath` chỉ nhận đường dẫn nội bộ (từ chối URL tuyệt đối, `//`, `\`, ký tự điều khiển).
7. **Mật khẩu**: tối thiểu 8 ký tự, tối đa 72 byte UTF-8 (giới hạn bcrypt); `minimum_password_length = 8` trong `supabase/config.toml` phải khớp cấu hình project production.
8. **Log**: chỉ ghi mã lỗi/status, không ghi email hay mật khẩu.

## Hệ quả
- Mọi trang có header trở thành dynamic (đọc cookie) — chấp nhận ở MVP.
- E2E auth cần Supabase local + Mailpit; rate limit email/sign-in được nới **chỉ trong config local**.
- Production: cấu hình Site URL, Redirect URLs (`<domain>/auth/callback`), SMTP và chính sách mật khẩu trên project trước khi phát hành (Q08, Q11).
