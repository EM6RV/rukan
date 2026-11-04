CREATE TABLE `inbox_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`external_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_channels_store_id_uq` ON `inbox_channels` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_channels_kind_uq` ON `inbox_channels` (`store_id`,`kind`);--> statement-breakpoint
CREATE TABLE `inbox_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`customer_id` text,
	`order_id` text,
	`external_thread_id` text,
	`participant_name` text NOT NULL,
	`participant_handle` text,
	`status` text DEFAULT 'open' NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`channel_id`) REFERENCES `inbox_channels`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`customer_id`) REFERENCES `customers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_conv_store_id_uq` ON `inbox_conversations` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `inbox_conv_last_idx` ON `inbox_conversations` (`store_id`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `inbox_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`direction` text NOT NULL,
	`body` text NOT NULL,
	`external_id` text,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`conversation_id`) REFERENCES `inbox_conversations`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inbox_msg_conv_idx` ON `inbox_messages` (`store_id`,`conversation_id`,`sent_at`);--> statement-breakpoint
ALTER TABLE `stores` ADD `inbox_beta` integer DEFAULT false NOT NULL;