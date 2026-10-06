# Architecture
## Stack baseline
Next.js App Router + TypeScript strict + Tailwind; Supabase Auth/Postgres/Storage; npm. Version đã xác minh và khóa ở ADR-004 (Next.js 16.3, React 19.2, TypeScript 5.9, Tailwind 4.3); lockfile được commit. Không ghi version đoán trong tài liệu.
## Luồng dữ liệu
UI → server component/query hoặc server action → validation + quyền → Supabase client theo session → RLS → database.
Browser client chỉ dùng ở phần cần tương tác/auth. Secret không vào client. Route/API không mở endpoint trùng server action nếu không có nhu cầu.
## Phân vùng
src/app cho route/layout, src/features cho nghiệp vụ, components/ui cho UI dùng chung. lib/supabase có server/browser client; giải quyết session theo SDK đã chọn. Không áp đặt tên middleware/proxy trước khi chọn Next.js version.
## Phân quyền
Metadata public và nội dung private tách bảng (ADR-002); role và trigger đăng ký theo ADR-003. Chi tiết trong ACCESS_CONTROL.md.
## Nội dung
Bài học Markdown được sanitize, có code block và ảnh; video optional, provider allowlist (Q07) và CSP phù hợp. Upload ảnh của admin vào Storage, policy storage và kiểm tra file thuộc task 021. Không cho HTML/script tùy ý. Lời giải MVP chỉ văn bản/mã (Q06).
## Triển khai
Phát triển local trước. Không tạo hosting hoặc production trong các task mặc định. Nếu thiếu credential, dựng UI với demo rõ nhãn nhưng báo tích hợp blocked. Không tuyên bố auth/data hoàn chỉnh.
## Kiểm tra
Scripts chuẩn (thiết lập ở task 001): `lint`, `typecheck`, `test` (unit), `test:integration` (RLS/query với Supabase local), `test:e2e` (flow trình duyệt), `build`. Công cụ dự kiến: Vitest cho unit, Playwright cho E2E; xác minh và ghi ADR khi bootstrap. Supabase local cần Docker; nếu môi trường thiếu, ghi integration là blocked (Q12).
