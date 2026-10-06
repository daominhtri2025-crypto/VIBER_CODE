# Sitemap
| URL | Quyền | Nội dung |
|---|---|---|
| / | Public | Giới thiệu, lộ trình và khóa nổi bật |
| /paths | Public | Lộ trình Scratch/Python |
| /paths/[slug] | Public | Thứ tự khóa trong lộ trình |
| /courses | Public | Catalog và bộ lọc |
| /courses/[slug] | Public published | Mục tiêu, yêu cầu, chương trình, preview |
| /exercises | Public | Metadata bài tập published |
| /exercises/[slug] | Student enrolled hoặc admin | Đề và gợi ý; solution qua server riêng |
| /login, /register, /forgot-password | Public | Auth |
| /auth/callback | Auth callback | Xử lý callback theo SDK được chọn |
| /reset-password | Recovery session | Đổi mật khẩu |
| /dashboard | Student/admin | Khóa đang học, học tiếp |
| /learn/[courseSlug]/[lessonSlug] | Enrolled hoặc public preview | Bài và mục lục |
| /profile | Signed-in | Tên hiển thị, thông tin tài khoản |
| /admin | Admin | Tổng quan |
| /admin/courses | Admin | Danh sách/biên tập khóa |
| /admin/courses/[id] | Admin | Chương và bài học |
| /admin/exercises | Admin | Biên tập bài tập |
Route group trong Next.js không tạo segment URL. Khóa draft trả 404 với người không có quyền. Không dựa riêng middleware để phân quyền dữ liệu.
