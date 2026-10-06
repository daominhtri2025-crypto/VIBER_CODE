# ADR-001 — Baseline dự kiến
Status: proposed; task 000 rà soát, task 001 xác nhận các lựa chọn triển khai.
- Một ứng dụng Next.js, chưa cần monorepo/microservices.
- Supabase cho auth và dữ liệu; npm; version khóa ở bootstrap.
- MVP miễn phí, admin/student, Scratch/Python.
- Markdown bài học, video optional; không chạy code.
- Student tự đánh dấu hoàn thành; mở solution sau đã thử.
- Public metadata tách nội dung private theo projection có enforcement.
## Lý do
Phù hợp một nhóm giáo viên vận hành, giảm độ phức tạp trước khi có học viên thật.
## Cần chốt khi triển khai
SDK/version, cách enforce projection nội dung, provider video, local DB workflow.
## Mẫu ADR mới
Bối cảnh → lựa chọn → lý do → hệ quả → trạng thái/ngày. Không âm thầm thay đổi baseline.
