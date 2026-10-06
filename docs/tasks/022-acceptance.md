# TASK-022: Nghiệm thu MVP
Status: pending

## Mục tiêu
Xác nhận MVP đáp ứng scope, quyền và chất lượng; sẵn sàng quyết định phát hành.

## Phụ thuộc
005–021 (trừ task bị bỏ theo Q03)

## Tài liệu liên quan
Toàn bộ docs

## Phạm vi
- Rà toàn bộ luồng, quyền, responsive, tiếp cận, hướng dẫn vận hành, env, hạn chế; đối chiếu tài liệu với code.

## Ngoài phạm vi
- Deploy production.

## Tiêu chí nghiệm thu
1. Mọi script pass; toàn bộ P-1 → P-15 pass bằng integration test.
2. Luồng học viên (đăng ký → enroll → học → bài tập → hoàn thành → học tiếp) và luồng admin (soạn → publish) pass E2E.
3. Không secret trong repo/bundle; không dữ liệu quảng bá giả; dữ liệu demo có nhãn.
4. Kiểm tra tiếp cận tự động không có vi phạm mức nghiêm trọng (WCAG 2.2 AA) trên trang chính.
5. Danh sách Q còn mở được trình bày kèm rủi ro phát hành.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Lệnh | `npm run lint && npm run typecheck && npm run test && npm run test:integration && npm run test:e2e && npm run build` | Exit 0 hoặc ghi blocked cụ thể |
| Thủ công | 375/768/1280px; chỉ dùng bàn phím | Đạt |
| Lệnh | Tìm khóa/secret trong `.next` và repo | Không có |

Mọi task sau 001: chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` theo thay đổi.

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
