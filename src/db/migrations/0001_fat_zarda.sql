ALTER TABLE `stores` ADD `onboarding_step` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `onboarded_at` integer;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `city_id` text REFERENCES cities(id);