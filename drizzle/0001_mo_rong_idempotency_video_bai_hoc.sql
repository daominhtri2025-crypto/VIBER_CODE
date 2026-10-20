CREATE TABLE `lessons` (
	`lesson` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`group_no` integer NOT NULL,
	`body` text NOT NULL,
	`quiz` text NOT NULL,
	`next_step` text,
	`created` text NOT NULL,
	CONSTRAINT "lessons_lesson_range" CHECK("lessons"."lesson" BETWEEN 0 AND 9),
	CONSTRAINT "lessons_group_range" CHECK("lessons"."group_no" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE `assessments` ADD `client_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_learner_client_unique` ON `assessments` (`learner`,`client_id`);--> statement-breakpoint
ALTER TABLE `videos` ADD `kind` text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE `videos` ADD `url` text;