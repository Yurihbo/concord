CREATE TABLE `calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callerId` int NOT NULL,
	`calleeId` int NOT NULL,
	`status` enum('ringing','connected','declined','ended','missed') NOT NULL DEFAULT 'ringing',
	`media` enum('audio','video','screen') NOT NULL DEFAULT 'audio',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	CONSTRAINT `calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `publicId` varchar(24) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_publicId_unique` UNIQUE(`publicId`);