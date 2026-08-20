CREATE TABLE `callSignals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` int NOT NULL,
	`senderId` int NOT NULL,
	`kind` enum('offer','answer','ice') NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `callSignals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `presence` enum('online','away','offline') DEFAULT 'online' NOT NULL;