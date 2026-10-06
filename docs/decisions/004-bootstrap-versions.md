# ADR-004 — Version và công cụ khi khởi tạo
Status: accepted (06/10/2026, TASK-001).

## Bối cảnh
ADR-001 yêu cầu xác minh version stable/tương thích từ nguồn chính thức khi bootstrap, không ghi version đoán.

## Phương pháp xác minh
- Version "latest" tra trực tiếp từ npm registry (`npm view <pkg> version`, `engines`, `peerDependencies`) ngày 06/10/2026.
- Khung dự án sinh bằng `create-next-app@16.3.8` (TypeScript, Tailwind, ESLint, App Router, `src/`, alias `@/*`, npm).
- Cấu hình Vitest/Playwright theo hướng dẫn đi kèm Next.js: `node_modules/next/dist/docs/01-app/02-guides/testing/{vitest,playwright}.md`.

## Quyết định
| Thành phần | Version khóa trong lockfile | Ghi chú |
|---|---|---|
| Node.js | `^22.12.0 \|\| >=24.0.0` (`engines`) | Ràng buộc chặt nhất đến từ Vitest 5; Next 16.3 yêu cầu ≥ 20.9. Môi trường kiểm tra: Node 22.22.0, npm 10.9.4 |
| next / eslint-config-next | 16.3.8 | Next 16: dùng `LayoutProps`/`PageProps` sinh bởi `next typegen` |
| react / react-dom | 19.2.8 | Do create-next-app chọn |
| typescript | 5.9.3 | Giữ nhánh 5.x do create-next-app chọn; TypeScript 7 chưa được bộ khởi tạo Next áp dụng — không tự nâng |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | Cấu hình CSS-first trong `globals.css` |
| eslint | 9.39.5 | Flat config `eslint.config.mjs` |
| vitest / @vitejs/plugin-react / jsdom | 5.0.3 / 6.1.2 / 30.1.2 | Unit test; alias `@` khai báo trực tiếp, không thêm `vite-tsconfig-paths` |
| @testing-library/react / dom | 16.3.3 / 10.4.2 | Test component đồng bộ |
| @playwright/test | 1.63.0 | E2E; chạy trên bản build production |

Chưa cài Supabase SDK: thuộc task 002/005; version và tên biến môi trường xác minh khi đó.

## Scripts (D14)
`dev`, `build`, `start`, `lint`, `typecheck` (= `next typegen && tsc --noEmit`), `test` (unit, `src/**/*.test.{ts,tsx}`), `test:watch`, `test:integration` (`tests/integration`, `passWithNoTests` cho tới task 002), `test:e2e` (`tests/e2e`).

## Lựa chọn phụ và lý do
- **Font hệ thống** thay cho `next/font/google` (Geist mặc định): Geist không được chọn vì cần bảo đảm hiển thị tiếng Việt và build không phụ thuộc mạng tới Google Fonts. Có thể đổi ở task giao diện bằng ADR mới.
- **Bỏ asset mẫu** của create-next-app (SVG, giao diện demo) để tránh nội dung không thuộc dự án.
- **AGENTS.md** do Next.js quản lý (`next dev` tự chèn lại khối hướng dẫn nếu thiếu); `CLAUDE.md` import file này.
- **Chromium của môi trường**: nếu trình duyệt Playwright đúng version chưa được cài, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` trỏ tới binary Chromium sẵn có; không tải trình duyệt trong môi trường bị hạn chế mạng.

## Hệ quả và rủi ro đã biết
- `npm audit` (06/10/2026): **0** lỗ hổng ở dependency runtime (`--omit=dev`); **5 high** ở chuỗi dev `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` (GHSA-vfj7-8cjw-p6xm, DoS với pattern lồng sâu). Không áp `npm audit fix --force` vì sẽ hạ `eslint-config-next` xuống 14.x. Rà lại khi Next phát hành bản vá.
- Vitest không hỗ trợ async Server Components; luồng dùng chúng kiểm thử bằng E2E (theo tài liệu Next.js).

## Tham khảo
- Vercel. (2026). *How to set up Vitest with Next.js* [Tài liệu đi kèm gói next@16.3.8, `dist/docs/01-app/02-guides/testing/vitest.md`].
- Vercel. (2026). *How to set up Playwright with Next.js* [Tài liệu đi kèm gói next@16.3.8, `dist/docs/01-app/02-guides/testing/playwright.md`].
