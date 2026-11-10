ALTER TABLE "asset_movements" ADD COLUMN "from_room" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_movements" ADD COLUMN "to_room" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "room" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "plan_id" integer;--> statement-breakpoint
ALTER TABLE "floor_plans" ADD COLUMN "rooms" jsonb;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_plan_id_floor_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."floor_plans"("id") ON DELETE set null ON UPDATE no action;