CREATE INDEX `progress_lesson_idx` ON `progress` (`lesson`);--> statement-breakpoint
CREATE INDEX `progress_completed_at_idx` ON `progress` (`completed_at`);--> statement-breakpoint
CREATE INDEX `quiz_attempts_lesson_created_idx` ON `quiz_attempts` (`lesson`,`created`);--> statement-breakpoint
CREATE INDEX `quiz_attempts_learner_lesson_idx` ON `quiz_attempts` (`learner`,`lesson`);