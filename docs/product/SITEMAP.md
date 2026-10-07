# Sitemap
Chủ thể: **K** = khách (anon); **U** = đã đăng nhập, chưa đăng ký khóa liên quan; **E** = đã đăng ký khóa liên quan; **A** = admin. Ký hiệu: ✓ được phép; CTA = hiện metadata kèm nút hành động; →L = chuyển tới `/login?next=…`; 404 = trang không tồn tại.

## 1. Route
| URL | K | U | E | A | Nội dung / ghi chú | Task |
|---|---|---|---|---|---|---|
| `/` | ✓ | ✓ | ✓ | ✓ | Giá trị, chọn Scratch/Python, lộ trình, khóa nổi bật (`is_featured`) | 008 |
| `/paths` | ✓ | ✓ | ✓ | ✓ | Lộ trình published (Q03) | 009 |
| `/paths/[slug]` | ✓ | ✓ | ✓ | ✓ | Khóa published theo thứ tự; path draft → 404 (trừ A) | 009 |
| `/courses` | ✓ | ✓ | ✓ | ✓ | Catalog; lọc `language`, `level`; trạng thái rỗng | 010 |
| `/courses/[slug]` | ✓ | ✓ | ✓ | ✓ | Mục tiêu, yêu cầu, chương trình, link preview; nút "Đăng ký khóa" (K: →L) | 010, 011 |
| `/learn/[courseSlug]` | →L | CTA | ✓ | ✓ | Chuyển tới bài "học tiếp" (DATA_MODEL §4) | 016 |
| `/learn/[courseSlug]/[lessonSlug]` | preview ✓, khác CTA | preview ✓, khác CTA | ✓ | ✓ | Mục lục + bài; bài không thuộc khóa → 404 | 012 |
| `/exercises` | ✓ | ✓ | ✓ | ✓ | Metadata bài tập published thuộc khóa published; lọc ngôn ngữ, độ khó, khóa | 013 |
| `/exercises/[slug]` | CTA | CTA | ✓ | ✓ | Đề + gợi ý; lời giải lấy qua server action riêng | 013, 014 |
| `/login`, `/register`, `/forgot-password` | ✓ | → `/dashboard` | → `/dashboard` | → `/dashboard` | Màn hình auth | 005, 006 |
| `/auth/callback` | — | — | — | — | Đổi `code` (PKCE) lấy session rồi chuyển tới `next` nội bộ; lỗi → `/login?error=link` (ADR-006) | 005, 006 |
| `/reset-password` | Chỉ khi có recovery session | ✓ | ✓ | ✓ | Đổi mật khẩu; link hết hạn → hướng dẫn gửi lại | 006 |
| `/dashboard` | →L | ✓ | ✓ | ✓ | Khóa đã đăng ký, %, "Học tiếp" | 016 |
| `/profile` | →L | ✓ | ✓ | ✓ | Tên hiển thị, email (chỉ đọc), đổi mật khẩu | 007 |
| `/admin` | →L | 404 | 404 | ✓ | Tổng quan số lượng nội dung theo trạng thái | 017 |
| `/admin/courses`, `/admin/courses/new`, `/admin/courses/[id]` | →L | 404 | 404 | ✓ | Khóa, chương, thứ tự bài | 017 |
| `/admin/lessons/[id]` | →L | 404 | 404 | ✓ | Biên tập bài học, preview, publish | 018 |
| `/admin/exercises`, `/admin/exercises/new`, `/admin/exercises/[id]` | →L | 404 | 404 | ✓ | Bài tập, gợi ý, lời giải | 019 |
| `/admin/paths`, `/admin/paths/[id]` | →L | 404 | 404 | ✓ | Lộ trình (Q03) | 020 |
| `not-found`, `error` | ✓ | ✓ | ✓ | ✓ | Trang lỗi tiếng Việt có liên kết về trang chủ | 008 |

## 2. Chính sách từ chối
1. Nội dung không tồn tại, draft hoặc archived đối với chủ thể không có quyền → **404**. Không phân biệt "không có" với "không được xem", để tránh lộ sự tồn tại của nội dung.
2. Trang cá nhân hoặc admin khi chưa đăng nhập → **→L**. Sau khi đăng nhập quay lại `next`; `next` chỉ chấp nhận đường dẫn nội bộ bắt đầu bằng `/`.
3. Người dùng không phải admin vào `/admin/**` → **404**.
4. Nội dung published nhưng private (bài không preview, bài tập) → **CTA**: chỉ hiện metadata public kèm nút đăng nhập/đăng ký khóa; không gửi body xuống client.
5. Server action bị từ chối → trả lỗi có mã (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`) và thông điệp tiếng Việt; không trả dữ liệu.

## 3. Ghi chú kỹ thuật
Route group trong Next.js không tạo segment URL. Không dựa riêng vào middleware/proxy để phân quyền dữ liệu; mọi truy vấn đều phải qua RLS và kiểm tra tại server.
