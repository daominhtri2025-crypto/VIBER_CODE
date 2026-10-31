-- Quản lý bài học (CLAUDE.md mục 4.4, 4.15, 4.16; quyết định 30/10/2026).
-- Tác động lên dữ liệu hiện có: 10 bài đã seed được sao chép nguyên vẹn, hidden = 0, updated = created.
-- Không có bảng nào khóa ngoại tới lessons, nên dựng lại bảng không ảnh hưởng tiến độ, phiếu, lượt làm hay video.
-- Khôi phục: nếu cần quay lại, dựng lại bảng lessons theo migration 0001 rồi chép các cột tương ứng từ bản sao lưu.

-- Bảng mới bỏ CHECK 0–9 cũ: mã bài chỉ cần không âm; giới hạn trên do máy chủ kiểm tra (LESSON_CODE_MAX).
CREATE TABLE `lessons_moi` (
	`lesson` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`group_no` integer NOT NULL,
	`body` text NOT NULL,
	`quiz` text NOT NULL,
	`next_step` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lessons_lesson_min" CHECK (lesson >= 0),
	CONSTRAINT "lessons_group_range" CHECK (group_no BETWEEN 1 AND 5),
	CONSTRAINT "lessons_hidden_bool" CHECK (hidden IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `lessons_moi` (`lesson`, `title`, `group_no`, `body`, `quiz`, `next_step`, `created`, `updated`, `hidden`)
SELECT `lesson`, `title`, `group_no`, `body`, `quiz`, `next_step`, `created`, `created`, 0 FROM `lessons`;
--> statement-breakpoint
DROP TABLE `lessons`;
--> statement-breakpoint
ALTER TABLE `lessons_moi` RENAME TO `lessons`;
--> statement-breakpoint
-- Lịch sử phiên bản: mỗi lần sửa lưu bản trước đó (kể cả trạng thái ẩn), kèm người sửa và thời điểm.
CREATE TABLE `lesson_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson` integer NOT NULL,
	`title` text NOT NULL,
	`group_no` integer NOT NULL,
	`body` text NOT NULL,
	`quiz` text NOT NULL,
	`next_step` text,
	`hidden` integer NOT NULL,
	`saved_by` text NOT NULL,
	`saved_at` text NOT NULL,
	FOREIGN KEY (`lesson`) REFERENCES `lessons`(`lesson`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lesson_versions_lesson_idx` ON `lesson_versions` (`lesson`, `saved_at`);
--> statement-breakpoint
