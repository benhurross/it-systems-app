ALTER TABLE "assets" ADD COLUMN "beyond_repair_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "beyond_repair_reason" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "beyond_repair_by" text;