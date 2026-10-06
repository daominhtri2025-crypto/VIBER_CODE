# Biên bản rà soát đặc tả — TASK-000
Ngày: 06/10/2026 · Phạm vi: toàn bộ `CLAUDE.md`, `.claude/rules`, `docs/`, `prompts/`. Không viết mã ứng dụng.

## 1. Phương pháp
1. Đối chiếu chéo bốn trục: phạm vi (MVP_SCOPE) ↔ route (SITEMAP) ↔ dữ liệu (DATA_MODEL) ↔ quyền (ACCESS_CONTROL).
2. Với mỗi tài nguyên, xét bốn chủ thể: khách (anon), người dùng đã đăng nhập chưa đăng ký khóa, học viên đã đăng ký khóa, admin.
3. Kiểm tra từng task có tiêu chí nghiệm thu quan sát được và cách kiểm tra cụ thể hay không.
4. Kiểm tra liên kết Markdown nội bộ bằng script (xem PROJECT_STATUS).

Quy ước: **Quan sát** = trích nguyên trạng tài liệu trước rà soát (sự thật); **Đánh giá/Xử lý** = suy luận và đề xuất của người rà soát.

## 2. Phát hiện
| ID | Loại | Quan sát (tài liệu gốc) | Đánh giá / Xử lý | Trạng thái |
|---|---|---|---|---|
| R01 | Mâu thuẫn | ACCESS_CONTROL: anon đọc body bài preview, nhưng cột Student chỉ ghi "Published trong khóa enrolled" | Người đã đăng nhập chưa enroll sẽ thấy *ít hơn* khách. Sửa: preview đọc được bởi mọi chủ thể | Đã sửa |
| R02 | Mâu thuẫn | Task 007 có "reset completion own"; MVP_SCOPE không có | Bổ sung "bỏ đánh dấu hoàn thành" vào scope (chỉ dữ liệu của chính mình) | Đã sửa |
| R03 | Thiếu quyết định | `lessons.body_md`, `exercises.statement_md/hint*_md` nằm cùng bảng metadata public; RLS lọc theo hàng, không theo cột | Nếu anon có SELECT trên bảng, body bị lộ qua API trực tiếp. Đề xuất tách bảng nội dung → ADR-002 | Đề xuất (ADR-002) |
| R04 | Thiếu | Không mô tả cách tạo `profiles`/`user_roles` khi đăng ký | Rủi ro dùng `user_metadata` (client kiểm soát) để gán role. Quy định trigger + role mặc định → ADR-003 | Đề xuất (ADR-003) |
| R05 | Mơ hồ | USER_FLOWS: "gợi ý 1 → gợi ý 2" tuần tự; CLAUDE.md chỉ cấm lộ lời giải | Chưa rõ gợi ý có phải dữ liệu bí mật. Quyết định dự kiến D07 + Q05 | Chờ chốt |
| R06 | Dư thừa gây mâu thuẫn | `exercises.language` song song `courses.language` | Có thể lệch nhau. Bỏ cột, suy ra từ khóa | Đã sửa |
| R07 | Thiếu | Không có giá trị status cho lesson/exercise; chapter không có quy tắc hiển thị; exercise không có thứ tự; SITEMAP cần "mục tiêu, yêu cầu", trang chủ cần "khóa nổi bật" nhưng không có trường | Bổ sung trường và quy tắc tối thiểu | Đã sửa |
| R08 | Thiếu | Task 008 có CRUD path nhưng SITEMAP không có route admin cho path/bài học/bài tập chi tiết | Bổ sung route | Đã sửa |
| R09 | Mơ hồ | Hành vi khi bị từ chối không thống nhất (404, redirect, hay CTA) | Chính sách từ chối thống nhất trong SITEMAP §2 | Đã sửa |
| R10 | Rủi ro riêng tư | Admin "đọc profiles/progress khi cần quản trị", nhưng MVP không có UI xem học viên | Trái nguyên tắc tối thiểu hóa dữ liệu, nhất là với trẻ em. Mặc định không cấp. Q09 | Chờ chốt |
| R11 | Thiếu | `courses.status` có `archived` nhưng không định nghĩa ngữ nghĩa | Mặc định: archived ẩn với mọi người trừ admin, giữ tiến độ. Q04 | Chờ chốt |
| R12 | Rủi ro pháp lý | Người dùng là học sinh tiểu học/THCS; tài liệu không đề cập sự đồng ý của cha mẹ/người giám hộ | Cần ý kiến pháp lý trước khi public. Q01, Q02 | Chờ chốt |
| R13 | Mơ hồ | "không tính preview riêng hai lần" | Thay bằng công thức tiến độ chính xác (DATA_MODEL §4) | Đã sửa |
| R14 | Thiếu | Không có bất biến khi unpublish bài cuối của khóa published; điều kiện publish bài tập chưa nêu | D10, D11; Q14, Q15 | Đề xuất |
| R15 | Phạm vi | Yêu cầu MVP ngày 06/10/2026 không nêu "lộ trình", baseline có bảng path + CRUD | Có thể đơn giản hóa. Tách thành task độc lập, có thể bỏ. Q03 | Chờ chốt |
| R16 | Thiếu/Rủi ro | ARCHITECTURE cần ảnh trong bài; task 008 ghi upload "nếu cần". Ảnh lời giải Scratch trong bucket public sẽ lộ đáp án | Upload thành task riêng; lời giải MVP chỉ văn bản/mã. Q06 | Đề xuất |
| R17 | Độ chi tiết | Task 002, 003, 008 gộp nhiều hạng mục; tiêu chí nghiệm thu chưa đánh số, chưa có ca kiểm thử cụ thể | Tách thành 23 task (000–022), mỗi task có AC đánh số và bảng kiểm tra | Đã sửa |
| R18 | Thiếu | CLAUDE.md liệt kê 4 script; integration/E2E chưa có tên script | Quy định `test:integration`, `test:e2e` trong task 001 | Đã sửa |
| R19 | Phụ thuộc | Task 004 (catalog) phụ thuộc 003 (auth) dù catalog là public | Phụ thuộc mới dựa trên dữ liệu seed và layout | Đã sửa |
| R20 | Thiếu | FOLDER_STRUCTURE thiếu feature admin, paths, profile | Bổ sung | Đã sửa |
| R21 | Mơ hồ | UI: "kiểm tra contrast thực tế" không có chuẩn đích | Đích dự kiến WCAG 2.2 mức AA (D13) | Đề xuất |
| R22 | Mơ hồ | `/dashboard` "Student/admin"; admin có được enroll không | Mọi user đăng nhập có quyền học viên trên dữ liệu của chính mình (D05) | Đã sửa |
| R23 | Mơ hồ | `lessons.slug` unique toàn cục trong khi URL lồng theo khóa | Giữ unique toàn cục; route phải kiểm tra bài thuộc khóa, sai → 404 | Đã sửa |
| R24 | Thiếu | Chống lạm dụng đăng ký/đăng nhập (rate limit) chưa nêu | Dùng giới hạn của Supabase Auth, xác minh ở task 005; không tự xây | Ghi nhận |

## 3. Kết luận
- Không còn mâu thuẫn chưa xử lý giữa phạm vi, route, dữ liệu và quyền trong baseline đã cập nhật.
- Các điểm còn mở được ghi trong [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md). Q01–Q02 chặn việc **phát hành public**, không chặn phát triển local.
- Q03 (lộ trình) cần chốt trước task 009/020. Các câu còn lại có giá trị mặc định đủ để bắt đầu task 001.

## 4. Giới hạn của rà soát
- Chưa xác minh version SDK/Next.js/Supabase (thuộc task 001).
- Các nhận định pháp lý (Q01) là suy luận của người rà soát, không phải ý kiến pháp lý.
