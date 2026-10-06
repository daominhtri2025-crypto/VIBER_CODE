# ADR-001 — Baseline dự kiến
Status: proposed (rà soát bởi TASK-000 ngày 06/10/2026). Task 001 xác nhận các lựa chọn triển khai.

## Bối cảnh
Nhóm giáo viên nhỏ vận hành website học lập trình miễn phí cho học sinh; chưa có học viên thật.

## Quyết định dự kiến
| ID | Quyết định | Tham chiếu |
|---|---|---|
| D01 | Một ứng dụng Next.js App Router + TypeScript strict + Tailwind; không monorepo/microservices | ARCHITECTURE |
| D02 | Supabase (Auth, Postgres, Storage); npm; version khóa ở task 001 | ARCHITECTURE |
| D03 | MVP miễn phí; hai role admin/student; ngôn ngữ Scratch/Python | MVP_SCOPE |
| D04 | Bài học Markdown sanitize, video tùy chọn; không chạy/chấm code | ARCHITECTURE |
| D05 | Mọi user đăng nhập có quyền học viên trên dữ liệu của mình; admin thêm quyền nội dung | ACCESS_CONTROL |
| D06 | Tách bảng metadata public / nội dung private để RLS thực thi theo hàng | ADR-002 |
| D07 | Gợi ý không bí mật với học viên đã enroll; tối đa 2 mức; lời giải là dữ liệu khóa | MVP_SCOPE, Q05 |
| D08 | Trigger tạo profile + role student khi đăng ký; admin provision bằng SQL | ADR-003 |
| D09 | Từ chối truy cập nội dung → 404; trang cần đăng nhập → redirect login | SITEMAP §2 |
| D10 | Không cho unpublish/archive bài published cuối cùng của khóa đang published | DATA_MODEL §4 |
| D11 | Publish bài tập yêu cầu đề, gợi ý 1 và lời giải | DATA_MODEL §4, Q14 |
| D12 | Tối thiểu hóa dữ liệu: chỉ email, mật khẩu, tên hiển thị; admin không xem dữ liệu cá nhân học viên trong MVP | PRODUCT_BRIEF, Q09 |
| D13 | Đích tiếp cận WCAG 2.2 AA | UI_GUIDELINES |
| D14 | Scripts chuẩn: lint, typecheck, test, test:integration, test:e2e, build | ARCHITECTURE |

## Lý do
Phù hợp một nhóm giáo viên vận hành; giảm độ phức tạp và bề mặt dữ liệu cá nhân trước khi có học viên thật.

## Hệ quả
Một số tiện ích quản trị (xem tiến độ từng học viên, gán quyền qua UI) không có trong MVP. Thay đổi bất kỳ D nào cần ADR mới hoặc cập nhật ADR này kèm ngày.

## Cần chốt khi triển khai
Version SDK/framework (task 001), quy trình DB local (Q12), allowlist video (Q07), các câu hỏi trong OPEN_QUESTIONS.

## Mẫu ADR mới
Bối cảnh → lựa chọn đã xét → quyết định → lý do → hệ quả → trạng thái/ngày. Không âm thầm thay đổi baseline.
