# Folder conventions
| Path | Trách nhiệm |
|---|---|
| src/app/(public) | Home, paths, catalog |
| src/app/(auth) | Auth screens |
| src/app/(student) | Dashboard, learn, profile |
| src/app/(admin)/admin | Admin URLs và layout |
| src/features/auth, profile, paths, courses, lessons, exercises, progress, admin | Nghiệp vụ (paths phụ thuộc Q03) |
| src/components/ui | UI tái sử dụng |
| src/components/layout | Header, sidebar, footer |
| src/lib/supabase | Browser/server clients |
| src/lib/validation | Schema dùng chung khi thật sự có |
| src/types | Kiểu dùng chung/generated DB types |
| public | Assets công khai |
| supabase/migrations | SQL versioned |
| supabase/seed.sql | Dữ liệu demo |
| tests/e2e, tests/integration | Kiểm thử flow và RLS |
Trong feature: components/, queries.ts, actions.ts, schemas.ts tùy nhu cầu. Unit tests có thể đặt cùng logic. Không tạo tất cả thư mục bằng file rỗng.
