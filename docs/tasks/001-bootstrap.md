# TASK-001: Khởi tạo dự án
Status: pending

## Mục tiêu
Có khung Next.js chạy local, đủ công cụ kiểm tra để các task sau dùng.

## Phụ thuộc
000

## Tài liệu liên quan
ARCHITECTURE, FOLDER_STRUCTURE, ADR-001, .claude/rules/coding.md

## Phạm vi
- Khởi tạo Next.js App Router + TypeScript strict + Tailwind trong thư mục gốc, giữ nguyên docs.
- Xác minh version stable/tương thích từ tài liệu chính thức; ghi ADR-004 (versions, công cụ test); commit lockfile.
- Scripts: `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `build` (D14). `test:integration`/`test:e2e` được phép chỉ có 1 smoke test.
- Trang chủ tạm tiếng Việt có nhãn rõ là trang khởi tạo; `.env.example` đúng tên biến của SDK đã chọn.
- README: yêu cầu môi trường, cách cài, chạy, kiểm tra.

## Ngoài phạm vi
- Auth, Supabase client, schema, UI thật của các trang.

## Tiêu chí nghiệm thu
1. `npm ci` trên clone sạch thành công.
2. Cả 6 scripts tồn tại; `lint`, `typecheck`, `test`, `build` pass.
3. Có ít nhất 1 unit test và 1 E2E smoke kiểm tra trang chủ trả 200 với `lang="vi"`.
4. ADR-004 ghi version, nguồn tham khảo, ngày kiểm tra.
5. Không có secret trong repo; `.env*` bị ignore trừ `.env.example`.

## Kiểm tra
| Loại | Ca / lệnh | Kỳ vọng |
|---|---|---|
| Lệnh | `npm ci && npm run lint && npm run typecheck && npm run test && npm run build` | Exit 0 |
| Lệnh | `npm run test:e2e` | Smoke pass, hoặc ghi blocked nếu thiếu trình duyệt |
| Thủ công | `npm run dev` và mở `/` | Trang tiếng Việt, không lỗi console |

## Quy tắc hoàn thành
Cập nhật PROJECT_STATUS: file chính, lệnh đã chạy và kết quả thật, hạn chế/blocked, giả định theo Qxx. Không làm task tiếp nếu chưa được giao.
