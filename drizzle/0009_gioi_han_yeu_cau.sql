-- Migration 0009: bộ đếm yêu cầu theo cửa sổ giờ, dùng cho giới hạn theo IP của khôi phục mật khẩu (SRS FR-AUTH-11; CLAUDE.md mục 2, 5).
-- Tác động dữ liệu: chỉ thêm một bảng mới, không sửa bảng cũ. Dữ liệu hiện có không đổi.
-- Khôi phục: DROP TABLE request_limits; (chỉ mất bộ đếm, không ảnh hưởng tài khoản, token hay phiên đăng nhập).
-- Khóa có dạng "<phạm vi>:<băm SHA-256 của IP>"; bảng không lưu IP thô.
-- window_start là đầu giờ UTC của cửa sổ hiện tại (ISO 8601, ví dụ 2026-10-30T10:00:00.000Z).
CREATE TABLE `request_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` text NOT NULL,
	`count` integer NOT NULL CHECK (`count` >= 0)
);
