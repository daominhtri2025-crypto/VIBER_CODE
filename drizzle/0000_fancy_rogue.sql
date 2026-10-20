CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`learner` text NOT NULL,
	`phase` text NOT NULL,
	`scores` text NOT NULL,
	`assessor` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`learner`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `learners` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learners_code_unique` ON `learners` (`code`);--> statement-breakpoint
CREATE TABLE `progress` (
	`learner` text NOT NULL,
	`lesson` integer NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`learner`, `lesson`),
	FOREIGN KEY (`learner`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`email` text PRIMARY KEY NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`lesson` integer PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`duration` integer NOT NULL,
	`updated` text NOT NULL
);
