# TASK-000: Rà soát đặc tả
Status: done

## Mục tiêu
Bộ tài liệu nhất quán, đủ làm căn cứ cho task 001.

## Phụ thuộc
Không

## Tài liệu liên quan
Toàn bộ docs, CLAUDE.md, .claude/rules

## Phạm vi
- Đối chiếu scope ↔ route ↔ dữ liệu ↔ quyền; sửa mâu thuẫn; ghi quyết định dự kiến và câu hỏi mở.
- Chia backlog thành task nhỏ có tiêu chí nghiệm thu và cách kiểm tra.

## Ngoài phạm vi
- Khởi tạo app, cài dependency, tạo database, viết mã ứng dụng.

## Tiêu chí nghiệm thu
1. Mọi route trong SITEMAP có quyền cho K/U/E/A và hành vi khi từ chối.
2. Mọi bảng trong DATA_MODEL có dòng tương ứng trong ma trận ACCESS_CONTROL.
3. Không có chạy code/AI/thanh toán trong MVP.
4. Cách thực thi projection nội dung được ghi thành ADR.
5. Mỗi task có phụ thuộc, AC đánh số và bảng kiểm tra.
6. Câu hỏi mở có đề xuất mặc định và hạn chốt.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Script | Kiểm tra liên kết Markdown nội bộ | 0 liên kết hỏng |
| Đọc chéo | Mỗi task ID trong BACKLOG có file; mỗi file có trong BACKLOG | Khớp 1–1 |
| Đọc chéo | Tên bảng trong ACCESS_CONTROL ⊆ DATA_MODEL | Khớp |

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
