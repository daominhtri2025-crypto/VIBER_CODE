# Trạng thái dự án
Cập nhật: 06/10/2026.

## Hiện tại
TASK-000 → 004 **done** (003 làm cùng 002). Có schema 14 bảng + RLS, dữ liệu demo, tài khoản demo local và hướng dẫn cấp quyền admin. Chưa có giao diện auth hay chức năng học tập.

## Lần cập nhật gần nhất — TASK-004 (07/10/2026)
- **Status**: done.
- **Xác minh lại TASK-002 trên container mới** (Docker khởi động lại): `db:reset` 4 migration OK, type sinh lại khớp bản commit, 14/14 bảng bật RLS, integration 48/48, unit 8/8, lint/typecheck/build OK.
- **Thay đổi chính**: `supabase/seed.sql`; `scripts/seed-demo-users.mjs`; `assertLocalUrl` trong `scripts/supabase-status.mjs`; scripts `db:seed-users`, `db:setup`; `tests/integration/seed.test.ts`; `docs/operations/ADMIN_PROVISIONING.md`, `docs/operations/LOCAL_DEMO_ACCOUNTS.md`; README; task 004, BACKLOG.
- **Lệnh đã chạy và kết quả**:
  | Lệnh | Kết quả |
  |---|---|
  | `npm run db:setup` | reset + seed + 3 tài khoản demo + `.env.local`, exit 0 |
  | `npm run db:seed-users` chạy lần 2 | Idempotent, không lỗi |
  | Đăng nhập thử học viên A và admin bằng publishable key | OK; role student/admin đúng; A có 1 enrollment |
  | `npm run test:integration` | **55/55** pass (schema 18, rls 30, seed 7) |
  | `npm run lint`, `typecheck`, `test`, `build`, `db:lint` | exit 0 |
- **Hạn chế**: mật khẩu demo ghi trong tài liệu (chỉ local, script chặn môi trường khác). Q16 (audit log) vẫn mở.

## Bước tiếp
1. Trả lời Q16 trước TASK-017.
2. TASK-005: đăng ký/đăng nhập/đăng xuất, proxy làm mới session.

## Lịch sử — TASK-002 (06/10/2026)
- **Status**: done. Theo yêu cầu người dùng, gộp phần schema/RLS của TASK-003 và tạo Supabase client sớm (vốn thuộc 005).
- **Thay đổi chính**:
  - `supabase/config.toml` (tắt realtime/edge/analytics, Storage tắt tới 021), 4 migration trong `supabase/migrations/`: bảng nội dung; danh tính + học viên + trigger đăng ký; bất biến publish/cấu trúc; hàm `private.*` + 28 policy + grant theo cột.
  - `src/lib/supabase/{env,server,client}.ts`, `src/lib/supabase/env.test.ts`, `src/types/database.ts`.
  - `scripts/supabase-status.mjs`, `scripts/write-env-local.mjs`; scripts `db:start|stop|reset|lint|types|env`.
  - `tests/integration/helpers/*`, `tests/integration/schema.test.ts`, `tests/integration/rls.test.ts`.
  - Tài liệu: ADR-005 (mới), ADR-002/003 accepted, DATA_MODEL implemented, OPEN_QUESTIONS (chốt mặc định, thêm Q16), README, `.env.example`, task 002–005, BACKLOG.
- **Lệnh đã chạy và kết quả**:
  | Lệnh | Kết quả |
  |---|---|
  | `dockerd` (khởi động thủ công trong môi trường cloud) + `npm run db:start` | Postgres 17.11, GoTrue 2.197, PostgREST 16.4 chạy |
  | `npm run db:reset` | 4 migration áp dụng trên DB trống, không lỗi |
  | `npm run db:lint` | No schema errors |
  | `npm run test:integration` | **48/48 pass** (schema 18, rls 30) |
  | Mutation check (làm hỏng 3 policy trực tiếp) | 4 test fail đúng chỗ → `db:reset` → 48/48 pass |
  | `npm run lint`, `npm run typecheck`, `npm run build` | exit 0 |
  | `npm run test` | 8/8 pass |
  | `npm run test:e2e` (với `PLAYWRIGHT_CHROMIUM_EXECUTABLE`) | 2/2 pass |
  | Quét secret trong repo và `.next/static` | Không có khóa; `.env.local` bị ignore |
- **Ca phân quyền đã kiểm chứng ở tầng DB**: P-1 → P-15 (ACCESS_CONTROL §4), cộng: preview cho người chưa enroll (R01), chương rỗng bị ẩn, admin không đọc dữ liệu học viên (Q09), không sửa `tried_at`, không xóa dữ liệu học viên, chỉ sửa được `display_name`.
- **Hạn chế / chưa xác minh**:
  - **Không tạo "nhật ký hệ thống"**: không có trong DATA_MODEL; ảnh hưởng tối thiểu hóa dữ liệu trẻ em → Q16 chờ quyết định.
  - Chưa có proxy làm mới session, chưa có trang auth (TASK-005). Client server/browser chưa được dùng ở trang nào nên chỉ kiểm tra qua typecheck/build và unit test cấu hình env.
  - Chưa có seed demo và hướng dẫn provision admin (TASK-004).
  - Q01, Q02, Q11, Q13 vẫn mở (cần quyết định pháp lý/thương hiệu trước khi public).
  - Supabase CLI cảnh báo type sinh ra chưa được format; giữ nguyên đầu ra của CLI.
- **Giả định**: Q04–Q10, Q12, Q14, Q15 theo mặc định (người dùng đồng ý 06/10/2026); Q03 giữ bảng lộ trình.

## Lịch sử — TASK-001 (06/10/2026)
- **Status**: done.
- **Thay đổi chính**:
  - Khung từ `create-next-app@16.3.8`: `package.json`, `package-lock.json`, `tsconfig.json` (strict), `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `AGENTS.md`.
  - `src/app/layout.tsx` (`lang="vi"`, metadata tiếng Việt), `src/app/globals.css` (màu theo UI_GUIDELINES, font hệ thống), `src/app/page.tsx` (trang khởi tạo có nhãn rõ).
  - Test: `vitest.config.mts`, `vitest.setup.ts`, `vitest.integration.config.mts`, `playwright.config.ts`, `src/app/page.test.tsx`, `tests/e2e/smoke.spec.ts`, `tests/integration/README.md`.
  - Tài liệu: ADR-004 (version, công cụ, rủi ro), README (mục Phát triển), CLAUDE.md (import AGENTS.md, tham chiếu ADR-004), `.env.example`, ARCHITECTURE.
- **Lệnh đã chạy (sau `rm -rf node_modules .next && npm ci`)**:
  | Lệnh | Kết quả |
  |---|---|
  | `npm ci` | 451 packages, exit 0 |
  | `npm run lint` | exit 0 |
  | `npm run typecheck` | exit 0 |
  | `npm run test` | 3/3 test pass |
  | `npm run test:integration` | exit 0, **0 test** (chưa có DB; `passWithNoTests`) |
  | `npm run build` | exit 0; route `/` và `/_not-found` static |
  | `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e` | 2/2 pass (200 + `lang="vi"` + không lỗi console; không tràn ngang ở 375px) |
  | `npm run dev` + `curl /` | Trả HTML có `lang="vi"`, tiêu đề, nhãn "Trang khởi tạo" |
  | `npm audit --omit=dev` | 0 lỗ hổng runtime |
- **Hạn chế / chưa xác minh**:
  - `test:integration` chưa có test thật; bắt đầu từ TASK-002.
  - E2E ở môi trường cloud này cần biến `PLAYWRIGHT_CHROMIUM_EXECUTABLE` vì Chromium cài sẵn (build 1194) khác version Playwright 1.63; không đặt biến → lỗi "Executable doesn't exist".
  - 5 cảnh báo high của `npm audit` trong chuỗi dev ESLint (chi tiết ADR-004), chưa có bản vá không phá vỡ.
  - Kiểm tra thủ công trên trình duyệt thật ở 768/1280px chưa thực hiện (chỉ có trang khởi tạo).
- **Giả định**: TASK-001 không phụ thuộc câu hỏi mở; Q12: môi trường hiện có Docker Engine 29.8 (chưa kiểm chứng Supabase CLI chạy được).

## Lịch sử — TASK-000
- **Status**: done.
- **Thay đổi chính**:
  - Biên bản rà soát với 24 phát hiện: `docs/reviews/000-spec-review.md`.
  - Viết lại MVP_SCOPE, SITEMAP (ma trận K/U/E/A + chính sách từ chối), USER_FLOWS, DATA_MODEL (tách bảng nội dung, vị từ hiển thị, quy tắc tiến độ/publish), ACCESS_CONTROL (ma trận dữ liệu, ma trận hành động, ca P-1 → P-15).
  - ADR-001 cập nhật danh sách quyết định D01–D14; thêm ADR-002 (projection nội dung) và ADR-003 (danh tính/role).
  - Thêm `docs/OPEN_QUESTIONS.md` (Q01–Q15).
  - Tách backlog thành 23 task (000–022); xóa các file task 002–009 cũ (vẫn còn trong lịch sử git).
  - Cập nhật PRODUCT_BRIEF, ARCHITECTURE, FOLDER_STRUCTURE, UI_GUIDELINES, TASK_TEMPLATE, CLAUDE.md, START_HERE, FILE_INDEX.
- **Kiểm tra đã chạy**: script kiểm tra liên kết Markdown nội bộ; đối chiếu BACKLOG ↔ file task; đối chiếu tên bảng ACCESS_CONTROL ↔ DATA_MODEL. Kết quả ghi ở mục dưới.
- **Chưa xác minh**: version framework/SDK (task 001); các nhận định pháp lý ở Q01 chưa được chuyên gia xác minh.
- **Giả định**: các câu hỏi Q01–Q15 dùng đề xuất mặc định cho tới khi được chốt.

## Kết quả kiểm tra TASK-000
- Liên kết Markdown nội bộ: 0 liên kết hỏng (script Python tạm, chưa đưa vào repo; task 001 có thể thêm thành script `docs:check`).
- BACKLOG ↔ file task: 23/23 khớp.
- 14 bảng trong DATA_MODEL đều có dòng trong ma trận ACCESS_CONTROL; mọi mã Qxx, Dxx, P-xx được tham chiếu đều đã định nghĩa. ADR-004 được tham chiếu có chủ đích (task 001 tạo).

## Mẫu cập nhật mỗi lần
- Task / status: pending | in_progress | blocked | done.
- Thay đổi chính và file liên quan.
- Lệnh kiểm tra / kết quả thực tế.
- Điều chưa xác minh và lý do.
- Quyết định mới và ADR liên quan; câu hỏi Qxx đã dùng mặc định.
- Nhiệm vụ tiếp theo.
