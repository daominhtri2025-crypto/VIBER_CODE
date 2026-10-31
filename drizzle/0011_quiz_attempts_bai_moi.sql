-- Lượt làm bài kiểm tra theo mã bài không còn giới hạn 0–9 (quyết định 30/10/2026; CLAUDE.md mục 4.4).
-- Migration 0004 có CHECK lesson BETWEEN 0 AND 9 khiến mọi lượt làm trên bài mã 10 trở lên bị từ chối.
-- Tác động lên dữ liệu hiện có: sao chép nguyên vẹn mọi lượt làm; không đổi choice, correct, client_id, created.
-- Khôi phục: dựng lại bảng quiz_attempts theo migration 0004 rồi chép lại từ bản sao lưu (mọi lượt có lesson 0–9 đều hợp lệ).
-- Không có bảng nào khóa ngoại tới quiz_attempts, nên dựng lại bảng không ảnh hưởng tham chiếu.

CREATE TABLE `quiz_attempts_moi` (
	`id` text PRIMARY KEY NOT NULL,
	`learner` text NOT NULL,
	`lesson` integer NOT NULL,
	`choice` integer NOT NULL,
	`correct` integer NOT NULL,
	`client_id` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`learner`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_attempts_lesson_min" CHECK (lesson >= 0),
	CONSTRAINT "quiz_attempts_choice_min" CHECK (choice >= 0),
	CONSTRAINT "quiz_attempts_correct_bool" CHECK (correct IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `quiz_attempts_moi` (`id`, `learner`, `lesson`, `choice`, `correct`, `client_id`, `created`)
SELECT `id`, `learner`, `lesson`, `choice`, `correct`, `client_id`, `created` FROM `quiz_attempts`;
--> statement-breakpoint
DROP TABLE `quiz_attempts`;
--> statement-breakpoint
ALTER TABLE `quiz_attempts_moi` RENAME TO `quiz_attempts`;
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempts_learner_client_unique` ON `quiz_attempts` (`learner`, `client_id`);
--> statement-breakpoint
CREATE INDEX `quiz_attempts_lesson_created_idx` ON `quiz_attempts` (`lesson`, `created`);
--> statement-breakpoint
CREATE INDEX `quiz_attempts_learner_lesson_idx` ON `quiz_attempts` (`learner`, `lesson`);
--> statement-breakpoint
