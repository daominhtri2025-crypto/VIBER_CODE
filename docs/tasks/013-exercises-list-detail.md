# TASK-013: Danh sách và chi tiết bài tập, gợi ý
Status: pending

## Mục tiêu
Học viên tìm bài tập và dùng gợi ý từng mức.

## Phụ thuộc
011; Q05

## Tài liệu liên quan
SITEMAP, USER_FLOWS §4, UI_GUIDELINES (Bài tập)

## Phạm vi
- `/exercises`: metadata live, lọc ngôn ngữ/độ khó/khóa.
- `/exercises/[slug]`: E thấy đề + nút hiện gợi ý 1, 2 (nếu có); K/U thấy metadata + CTA; liên kết bài học liên quan nếu bài học live.

## Ngoài phạm vi
- Lời giải, attempt (014).

## Tiêu chí nghiệm thu
1. Danh sách không có bài tập draft hoặc thuộc khóa draft.
2. Payload trang không chứa `solution_md`; với K/U không chứa đề/gợi ý.
3. Gợi ý 2 chỉ có nút khi `hint2_md` không rỗng.
4. Bộ lọc kết hợp đúng; rỗng có trạng thái rỗng.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | K/U/E mở cùng bài tập; kiểm tra network | Đúng dữ liệu theo quyền |
| E2E | Lọc python+advanced | Đúng tập kết quả |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
