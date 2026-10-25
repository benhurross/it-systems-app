CREATE TABLE "floor_plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "floor_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"file_name" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"page_width" real NOT NULL,
	"page_height" real NOT NULL,
	"mark_width" real DEFAULT 10 NOT NULL,
	"mark_height" real DEFAULT 9 NOT NULL,
	"switches" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floor_plans_storageKey_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "network_outlets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "network_outlets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"plan_id" integer NOT NULL,
	"panel" smallint,
	"panel_port" smallint,
	"switch_no" smallint,
	"switch_port" smallint,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"room" text DEFAULT '' NOT NULL,
	"asset_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"written" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_outlets" ADD CONSTRAINT "network_outlets_plan_id_floor_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."floor_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_outlets" ADD CONSTRAINT "network_outlets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_outlets_plan_id_index" ON "network_outlets" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "network_outlets_asset_id_index" ON "network_outlets" USING btree ("asset_id");