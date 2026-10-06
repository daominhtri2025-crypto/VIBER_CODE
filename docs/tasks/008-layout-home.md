# TASK-008: Layout chung và trang chủ
Status: pending

## Mục tiêu
Khách hiểu website và chọn được Scratch/Python.

## Phụ thuộc
001, 004

## Tài liệu liên quan
UI_GUIDELINES, SITEMAP

## Phạm vi
- Header (Lộ trình, Khóa học, Bài tập, tài khoản), footer, layout responsive, trang `not-found`/`error` tiếng Việt.
- Trang chủ: giá trị, chọn Scratch/Python, khóa nổi bật (`is_featured` ∧ live), cách học.

## Ngoài phạm vi
- Catalog, trang học.

## Tiêu chí nghiệm thu
1. Chỉ khóa live hiển thị; không có khóa nổi bật → ẩn mục, không khung rỗng.
2. Không có số liệu/đánh giá giả; không link chết.
3. 375/768/1280px không tràn ngang; điều hướng dùng được bằng bàn phím, focus rõ.
4. Trang 404 có liên kết về trang chủ.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| E2E | Viewport 375/768/1280; tab qua header | Không tràn; focus thấy rõ |
| E2E | Seed có khóa draft featured | Không hiển thị |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
