ALTER TABLE "floor_plans" ADD COLUMN "format" text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "floor_plans" ADD COLUMN "rack" jsonb;--> statement-breakpoint
ALTER TABLE "floor_plans" ADD COLUMN "layers" jsonb DEFAULT '{}'::jsonb NOT NULL;