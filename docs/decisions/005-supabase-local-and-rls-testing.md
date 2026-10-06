# ADR-005 — Supabase local, client và chiến lược kiểm thử RLS
Status: accepted (06/10/2026, TASK-002).

## Bối cảnh
TASK-002 cần database thật để chứng minh RLS (rules/testing.md: unit mock không thay thế). Q12 mặc định: Supabase CLI local trên Docker.

## Quyết định
1. **Supabase CLI là devDependency** (`supabase@2.119.0`) để version khóa trong lockfile; không cài global. Image local đã kiểm chứng: Postgres 17.11, GoTrue 2.197, PostgREST 16.4.
2. **Dịch vụ local**: tắt realtime, edge runtime, analytics (MVP không dùng); tắt Storage tới TASK-021. `npm run db:start` bỏ thêm studio, imgproxy, vector, logflare, supavisor để khởi động nhanh; muốn dùng Studio thì chạy `npx supabase start`.
3. **SDK**: `@supabase/supabase-js@2.117.2` + `@supabase/ssr@0.12.7`. Dùng **publishable key** (`sb_publishable_…`) cho client; biến `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (đối chiếu đầu ra `supabase status` của CLI 2.119). Secret key không có biến môi trường trong ứng dụng.
4. **Client**: `src/lib/supabase/server.ts` (Server Component/Function, cookie theo `next/headers`, async theo tài liệu Next 16), `src/lib/supabase/client.ts` (Client Component). Làm mới session ở proxy thuộc TASK-005.
5. **Schema `private`** chứa hàm kiểm tra quyền/trigger (`security definer`, `search_path = ''`, chỉ trả boolean/uuid); không nằm trong `api.schemas` nên không gọi được qua Data API.
6. **Tên định danh SQL bằng tiếng Anh, ASCII** (policy, hàm, trigger). Lý do: Postgres cắt định danh > 63 byte; tên tiếng Việt có dấu bị cắt ngầm khi thử nghiệm. Mô tả tiếng Việt đặt trong comment.
7. **Kiểm thử tích hợp**: mỗi file tự dựng "thế giới" dữ liệu với hậu tố ngẫu nhiên và tự dọn; service role **chỉ** dựng/dọn dữ liệu và provision admin; mọi khẳng định quyền dùng client anon/student/admin thật. Khóa local đọc từ `supabase status` lúc chạy (hoặc biến `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` trên CI), không ghi ra file.
8. **Mutation check**: đã cố ý làm hỏng 3 policy (bỏ điều kiện attempt, bỏ điều kiện preview/enroll, mở toàn bộ chương) → 4 test fail đúng chỗ; khôi phục bằng `db reset` → pass. Lặp lại khi sửa policy quan trọng.

## Hệ quả
- `npm run test:integration` cần Docker + `npm run db:start`. Trong môi trường cloud của Claude Code, Docker daemon không tự chạy: khởi động bằng `dockerd` trước.
- Đổi policy/hàm phải qua migration mới; chạy `npm run db:reset`, `npm run db:lint`, `npm run db:types`, `npm run test:integration`.
