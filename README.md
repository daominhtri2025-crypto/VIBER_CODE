# Coding Academy
Website học lập trình Scratch và Python bằng tiếng Việt cho học sinh tiểu học và THCS. Trạng thái: đã có khung Next.js (TASK-001) và schema + RLS Supabase (TASK-002); chưa có giao diện auth hay chức năng học tập. Xem docs/PROJECT_STATUS.md.

## Phát triển
Yêu cầu: Node.js `^22.12.0 || >=24`, npm. Version đã khóa: docs/decisions/004-bootstrap-versions.md.

```bash
npm ci            # cài đúng lockfile
npm run dev       # http://localhost:3000
```

| Script | Mục đích |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Sinh route types (`next typegen`) rồi `tsc --noEmit` |
| `npm run test` | Unit test (Vitest), file `src/**/*.test.ts(x)` |
| `npm run test:integration` | RLS và toàn vẹn dữ liệu với Supabase local (cần `db:start`) |
| `npm run test:e2e` | Playwright trên bản build production, thư mục `tests/e2e` |
| `npm run build` / `npm run start` | Build và chạy production local |

### Database local (Supabase)
Yêu cầu Docker đang chạy. Khóa local do CLI sinh, không commit.

```bash
npm run db:start          # khởi động Supabase local (Postgres, Auth, Data API, Mailpit)
npm run db:env            # ghi NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY vào .env.local
npm run db:setup          # reset + seed demo + tài khoản demo + .env.local (docs/operations/LOCAL_DEMO_ACCOUNTS.md)
npm run db:reset          # tạo lại DB từ supabase/migrations
npm run db:lint           # kiểm tra schema/hàm
npm run db:types          # sinh src/types/database.ts sau khi đổi schema
npm run test:integration  # RLS/toàn vẹn dữ liệu (cần db:start)
npm run db:stop
```

E2E cần Chromium cho Playwright: `npx playwright install chromium`. Nếu môi trường đã có sẵn Chromium khác version, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/đường/dẫn/chrome`.

---

# Bộ hướng dẫn Claude Code
Phiên bản 1.0 · 06/10/2026 · Ngôn ngữ: tiếng Việt.

## Bắt đầu
1. Clone repo VIBER_CODE và mở terminal tại thư mục gốc repo.
2. Đọc START_HERE.md và kiểm tra phạm vi MVP.
3. Chạy `claude` nếu Claude Code đã được cài đặt.
4. Dán nội dung prompts/01-review-spec.md. Nhiệm vụ này chỉ rà soát tài liệu.
5. Khi muốn bắt đầu code, dán prompts/02-bootstrap.md.
6. Giao từng task theo docs/tasks/BACKLOG.md; dùng prompts/03-implement-task.md.

CLAUDE.md là điểm vào. Quy tắc chuyên biệt nằm trong .claude/rules; đặc tả nằm trong docs. Không cần đọc toàn bộ tài liệu vào mỗi phiên.

## Giả định
Thương hiệu Coding Academy là tên tạm. MVP miễn phí, chỉ admin và student; chưa có marketplace, thanh toán, lớp học hay chạy code. Stack dự kiến: Next.js App Router, TypeScript, Tailwind CSS, Supabase. Version cụ thể được kiểm tra và khóa khi bootstrap.

## Kiểm tra
Xem mục Phát triển ở trên. Dùng `npm ci` (không đổi package manager).

## Tham khảo
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/settings
- https://bumbii.tech/
- https://www.udemy.com/
Học cách tổ chức; không sao chép học liệu, thương hiệu hoặc đánh giá của website khác.
