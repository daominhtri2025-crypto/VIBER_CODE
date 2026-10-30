-- Migration 0007: tin tức trang chủ (Sơn Trà Số, giai đoạn 1: quản trị viên đăng tay; chưa cào dữ liệu).
-- Tác động dữ liệu: chỉ thêm một bảng mới, rỗng khi áp dụng. Không sửa bảng cũ; dữ liệu hiện có không đổi.
-- Khôi phục: DROP TABLE news; (không ảnh hưởng accounts, sessions, lessons, progress, quiz_attempts).
-- created_by lưu id tài khoản quản trị tại thời điểm đăng; không đặt khóa ngoại để tin không mất khi tài khoản bị vô hiệu hóa.
CREATE TABLE `news` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL CHECK (length(`title`) BETWEEN 1 AND 200),
	`summary` text DEFAULT '' NOT NULL CHECK (length(`summary`) <= 500),
	`content` text DEFAULT '' NOT NULL CHECK (length(`content`) <= 5000),
	`source_url` text CHECK (`source_url` IS NULL OR (`source_url` LIKE 'https://%' AND length(`source_url`) <= 500)),
	`hidden` integer DEFAULT 0 NOT NULL CHECK (`hidden` IN (0, 1)),
	`published_at` text NOT NULL,
	`created_by` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `news_visible_published_idx` ON `news` (`hidden`,`published_at`);
