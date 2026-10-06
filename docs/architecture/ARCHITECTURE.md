# Architecture
## Stack baseline
Next.js App Router + TypeScript strict + Tailwind; Supabase Auth/Postgres/Storage; npm. Bootstrap kiểm tra version stable và tương thích từ nguồn chính thức, ghi ADR, commit lockfile. Không ghi version đoán trong tài liệu.
## Luồng dữ liệu
UI → server component/query hoặc server action → validation + quyền → Supabase client theo session → RLS → database.
Browser client chỉ dùng ở phần cần tương tác/auth. Secret không vào client. Route/API không mở endpoint trùng server action nếu không có nhu cầu.
## Phân vùng
src/app cho route/layout, src/features cho nghiệp vụ, components/ui cho UI dùng chung. lib/supabase có server/browser client; giải quyết session theo SDK đã chọn. Không áp đặt tên middleware/proxy trước khi chọn Next.js version.
## Nội dung
Bài học Markdown được sanitize, có code block và ảnh; video optional, provider allowlist và CSP phù hợp. Upload admin vào Storage, policy storage và file validation thiết kế trong task admin. Không cho HTML script tùy ý.
## Triển khai
Phát triển local trước. Không tạo hosting hoặc production trong các task mặc định. Nếu thiếu credential, dựng UI với demo rõ nhãn nhưng báo tích hợp blocked. Không tuyên bố auth/data hoàn chỉnh.
## Kiểm tra
Lint/typecheck/build; Vitest cho logic thuần, Playwright cho flow; integration RLS với Supabase local nếu khả dụng. Lựa chọn test tools được xác minh khi bootstrap.
