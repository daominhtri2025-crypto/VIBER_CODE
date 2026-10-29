-- Migration 0006: tài khoản quản trị và tình nguyện viên, phiên đăng nhập (Giai đoạn 1; SRS FR-AUTH).
-- Tác động dữ liệu: chỉ thêm hai bảng mới, không sửa bảng cũ. Dữ liệu cũ không đổi.
-- Khôi phục: DROP TABLE sessions; DROP TABLE accounts; (không ảnh hưởng learners, staff, progress, quiz_attempts).
-- Bản ghi quản trị có id 'owner' và email 'chu-website'; email thật của chủ website không được lưu trong bảng này.
-- Mật khẩu chỉ lưu dạng băm PBKDF2-SHA256; token phiên chỉ lưu dạng băm SHA-256.
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL UNIQUE,
	`full_name` text,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL CHECK (`active` IN (0, 1)),
	`must_change` integer DEFAULT 0 NOT NULL CHECK (`must_change` IN (0, 1)),
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL REFERENCES `accounts`(`id`) ON DELETE CASCADE,
	`role` text NOT NULL CHECK (`role` IN ('admin', 'volunteer')),
	`expires_at` text NOT NULL,
	`created` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `sessions_account_idx` ON `sessions` (`account_id`);
