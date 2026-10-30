-- Migration 0008: token khôi phục mật khẩu qua email (Giai đoạn 1; SRS FR-AUTH-11; CLAUDE.md mục 2C, 5).
-- Tác động dữ liệu: chỉ thêm một bảng mới, không sửa bảng cũ. Dữ liệu hiện có không đổi.
-- Khôi phục: DROP TABLE password_reset_tokens; (không ảnh hưởng accounts, sessions, learners, progress).
-- Token gửi qua email là chuỗi ngẫu nhiên 256 bit; bảng chỉ lưu băm SHA-256 (64 ký tự hex).
-- Hiệu lực 15 phút (expires_at = created + 15 phút); used_at điền khi token được dùng hoặc bị vô hiệu hóa.
CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL REFERENCES `accounts`(`id`) ON DELETE CASCADE,
	`token_hash` text NOT NULL UNIQUE CHECK (length(`token_hash`) = 64),
	`created` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_account_idx` ON `password_reset_tokens` (`account_id`, `created`);
