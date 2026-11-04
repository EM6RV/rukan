CREATE TABLE `lounge_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`station_id` text NOT NULL,
	`customer_id` text,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'dashboard' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`station_id`) REFERENCES `stations`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`customer_id`) REFERENCES `customers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lounge_bookings_idx` ON `lounge_bookings` (`store_id`,`station_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `lounge_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`minutes` integer NOT NULL,
	`price` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lounge_packs_store_id_uq` ON `lounge_packs` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `lounge_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`station_kind` text,
	`room` text,
	`controllers` integer,
	`price` integer NOT NULL,
	`days` text DEFAULT '[]' NOT NULL,
	`from_minute` integer DEFAULT 0 NOT NULL,
	`to_minute` integer DEFAULT 1440 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lounge_rates_store_id_uq` ON `lounge_rates` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `lounge_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`station_id` text NOT NULL,
	`customer_id` text,
	`mode` text DEFAULT 'hour' NOT NULL,
	`limit_kind` text DEFAULT 'open' NOT NULL,
	`limit_value` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`events` text DEFAULT '[]' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`minutes` integer DEFAULT 0 NOT NULL,
	`matches` integer DEFAULT 0 NOT NULL,
	`charge` integer DEFAULT 0 NOT NULL,
	`minutes_used` integer DEFAULT 0 NOT NULL,
	`sale_id` text,
	`group_id` text,
	`booking_id` text,
	`started_by` text,
	`device_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`station_id`) REFERENCES `stations`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`branch_id`) REFERENCES `branches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`customer_id`) REFERENCES `customers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lounge_sessions_store_id_uq` ON `lounge_sessions` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `lounge_sessions_status_idx` ON `lounge_sessions` (`store_id`,`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `station_maintenance` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`station_id` text NOT NULL,
	`issue` text NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text,
	`actor_user_id` text,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`station_id`) REFERENCES `stations`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `station_maintenance_idx` ON `station_maintenance` (`store_id`,`station_id`);--> statement-breakpoint
CREATE TABLE `stations` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`room` text DEFAULT 'normal' NOT NULL,
	`seats` integer DEFAULT 2 NOT NULL,
	`screen` text,
	`color` text,
	`games` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`branch_id`) REFERENCES `branches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stations_store_id_uq` ON `stations` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stations_name_uq` ON `stations` (`store_id`,`branch_id`,`name`);--> statement-breakpoint
CREATE TABLE `tournament_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`round` integer NOT NULL,
	`slot` integer NOT NULL,
	`player1_id` text,
	`player2_id` text,
	`score1` integer,
	`score2` integer,
	`winner_id` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`tournament_id`) REFERENCES `tournaments`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_matches_slot_uq` ON `tournament_matches` (`store_id`,`tournament_id`,`round`,`slot`);--> statement-breakpoint
CREATE TABLE `tournament_players` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`tournament_id`) REFERENCES `tournaments`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_players_store_id_uq` ON `tournament_players` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_players_phone_uq` ON `tournament_players` (`store_id`,`tournament_id`,`phone`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`game` text NOT NULL,
	`format` text DEFAULT 'knockout' NOT NULL,
	`max_players` integer DEFAULT 16 NOT NULL,
	`entry_fee` integer DEFAULT 0 NOT NULL,
	`prizes` text,
	`starts_at` integer,
	`status` text DEFAULT 'registration' NOT NULL,
	`public_signup` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_store_id_uq` ON `tournaments` (`store_id`,`id`);