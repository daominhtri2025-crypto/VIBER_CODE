# TASK-014: Xác nhận đã thử và mở lời giải
Status: pending

## Mục tiêu
Học viên xem lời giải sau khi tự thử giải.

## Phụ thuộc
013

## Tài liệu liên quan
ACCESS_CONTROL (P-4 → P-6), USER_FLOWS §4

## Phạm vi
- Hộp thoại xác nhận "Tôi đã thử giải" → action ghi attempt idempotent → action lấy lời giải; lần sau mở trực tiếp.

## Ngoài phạm vi
- Chấm bài, nộp code/file.

## Tiêu chí nghiệm thu
1. Gọi action lấy lời giải khi chưa attempt → `FORBIDDEN`.
2. Sau xác nhận, lời giải hiển thị; tải lại trang vẫn mở được (đã có attempt).
3. U (chưa enroll) gọi action ghi attempt → bị từ chối.
4. Hộp thoại dùng được bằng bàn phím, có tiêu đề, trả focus khi đóng.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Integration | P-5, P-6, P-8 | Đúng kỳ vọng |
| E2E | Luồng gợi ý → xác nhận → lời giải | Pass |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
