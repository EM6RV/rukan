CREATE TABLE `gym_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text,
	`membership_id` text,
	`at` integer NOT NULL,
	`out_at` integer,
	`result` text NOT NULL,
	`reason` text,
	`via` text DEFAULT 'manual' NOT NULL,
	`device_id` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`member_id`) REFERENCES `gym_members`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gym_checkins_at_idx` ON `gym_checkins` (`store_id`,`at`);--> statement-breakpoint
CREATE INDEX `gym_checkins_member_idx` ON `gym_checkins` (`store_id`,`member_id`,`at`);--> statement-breakpoint
CREATE TABLE `gym_class_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`class_id` text NOT NULL,
	`member_id` text NOT NULL,
	`day` text NOT NULL,
	`status` text DEFAULT 'booked' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`class_id`) REFERENCES `gym_classes`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`member_id`) REFERENCES `gym_members`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_class_bookings_uq` ON `gym_class_bookings` (`store_id`,`class_id`,`member_id`,`day`);--> statement-breakpoint
CREATE TABLE `gym_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`trainer_id` text,
	`room` text,
	`weekday` integer NOT NULL,
	`start_minute` integer NOT NULL,
	`duration_min` integer DEFAULT 60 NOT NULL,
	`capacity` integer DEFAULT 15 NOT NULL,
	`section` text DEFAULT 'mixed' NOT NULL,
	`cancel_before_min` integer DEFAULT 120 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`trainer_id`) REFERENCES `gym_trainers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_classes_store_id_uq` ON `gym_classes` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `gym_installments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`member_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`amount` integer NOT NULL,
	`paid_at` integer,
	`method` text,
	`note` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`membership_id`) REFERENCES `gym_memberships`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`member_id`) REFERENCES `gym_members`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gym_installments_due_idx` ON `gym_installments` (`store_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `gym_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text NOT NULL,
	`at` integer NOT NULL,
	`weight_g` integer,
	`fat_pct10` integer,
	`muscle_g` integer,
	`chest_mm` integer,
	`waist_mm` integer,
	`hips_mm` integer,
	`arm_mm` integer,
	`thigh_mm` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`actor_user_id` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`member_id`) REFERENCES `gym_members`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gym_measurements_idx` ON `gym_measurements` (`store_id`,`member_id`,`at`);--> statement-breakpoint
CREATE TABLE `gym_members` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`customer_id` text,
	`parent_member_id` text,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`section` text DEFAULT 'men' NOT NULL,
	`birth_date` text,
	`height_cm` integer,
	`weight_kg` integer,
	`emergency_name` text,
	`emergency_phone` text,
	`health_notes` text,
	`photo_media_id` text,
	`terms_accepted_at` integer,
	`qr_token` text NOT NULL,
	`portal_hash` text,
	`portal_sessions` text DEFAULT '[]' NOT NULL,
	`photos_consent` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`customer_id`) REFERENCES `customers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_members_store_id_uq` ON `gym_members` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gym_members_phone_uq` ON `gym_members` (`store_id`,`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `gym_members_qr_uq` ON `gym_members` (`qr_token`);--> statement-breakpoint
CREATE TABLE `gym_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`plan_name` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`visits_left` integer,
	`frozen_days` integer DEFAULT 0 NOT NULL,
	`frozen_since` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`price` integer NOT NULL,
	`section` text DEFAULT 'mixed' NOT NULL,
	`from_minute` integer,
	`to_minute` integer,
	`max_freeze_days` integer DEFAULT 0 NOT NULL,
	`addons` text DEFAULT '[]' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`member_id`) REFERENCES `gym_members`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`plan_id`) REFERENCES `gym_plans`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_memberships_store_id_uq` ON `gym_memberships` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `gym_memberships_member_idx` ON `gym_memberships` (`store_id`,`member_id`,`ends_at`);--> statement-breakpoint
CREATE TABLE `gym_message_log` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text DEFAULT '' NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`member_id`) REFERENCES `gym_members`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_message_log_uq` ON `gym_message_log` (`store_id`,`member_id`,`kind`,`ref_id`);--> statement-breakpoint
CREATE TABLE `gym_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'duration' NOT NULL,
	`days` integer DEFAULT 30 NOT NULL,
	`visits` integer,
	`price` integer NOT NULL,
	`join_fee` integer DEFAULT 0 NOT NULL,
	`section` text DEFAULT 'mixed' NOT NULL,
	`from_minute` integer,
	`to_minute` integer,
	`max_freeze_days` integer DEFAULT 0 NOT NULL,
	`family_size` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_plans_store_id_uq` ON `gym_plans` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `gym_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text NOT NULL,
	`trainer_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`member_id`) REFERENCES `gym_members`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gym_programs_idx` ON `gym_programs` (`store_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `gym_pt_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text NOT NULL,
	`trainer_id` text NOT NULL,
	`sessions` integer NOT NULL,
	`price` integer NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`member_id`) REFERENCES `gym_members`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`trainer_id`) REFERENCES `gym_trainers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_pt_packs_store_id_uq` ON `gym_pt_packs` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `gym_pt_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`commission` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`pack_id`) REFERENCES `gym_pt_packs`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gym_pt_sessions_at_idx` ON `gym_pt_sessions` (`store_id`,`at`);--> statement-breakpoint
CREATE TABLE `gym_trainers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`specialty` text,
	`bio` text,
	`photo_media_id` text,
	`hours` text,
	`commission_kind` text DEFAULT 'percent' NOT NULL,
	`commission_value` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_trainers_store_id_uq` ON `gym_trainers` (`store_id`,`id`);