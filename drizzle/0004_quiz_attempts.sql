CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`learner` text NOT NULL,
	`lesson` integer NOT NULL,
	`choice` integer NOT NULL,
	`correct` integer NOT NULL,
	`client_id` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`learner`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_attempts_lesson_range" CHECK("quiz_attempts"."lesson" BETWEEN 0 AND 9),
	CONSTRAINT "quiz_attempts_choice_min" CHECK("quiz_attempts"."choice" >= 0),
	CONSTRAINT "quiz_attempts_correct_bool" CHECK("quiz_attempts"."correct" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempts_learner_client_unique` ON `quiz_attempts` (`learner`,`client_id`);