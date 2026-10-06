# Trạng thái dự án
Cập nhật: 06/10/2026.

## Hiện tại
TASK-000 (rà soát đặc tả) **done**. Chưa khởi tạo ứng dụng, chưa cài dependency, chưa tạo database, chưa có mã ứng dụng. Baseline đặc tả đã nhất quán và đủ làm căn cứ cho TASK-001.

## Lần cập nhật gần nhất — TASK-000
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

## Bước tiếp
1. Chốt các câu hỏi chặn sớm: Q03 (lộ trình), Q04 (archived), Q12 (DB local) — trước task 002.
2. Giao TASK-001 (bootstrap) bằng `prompts/02-bootstrap.md`; task 001 không phụ thuộc câu hỏi mở nào.

## Mẫu cập nhật mỗi lần
- Task / status: pending | in_progress | blocked | done.
- Thay đổi chính và file liên quan.
- Lệnh kiểm tra / kết quả thực tế.
- Điều chưa xác minh và lý do.
- Quyết định mới và ADR liên quan; câu hỏi Qxx đã dùng mặc định.
- Nhiệm vụ tiếp theo.
