CREATE TABLE "device_sightings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "device_sightings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"device_key" text NOT NULL,
	"computer_name" text NOT NULL,
	"serial" text,
	"mac" text,
	"ip" text,
	"account" text DEFAULT '' NOT NULL,
	"asset_id" integer,
	"matched_by" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_sightings_deviceKey_unique" UNIQUE("device_key")
);
--> statement-breakpoint
ALTER TABLE "device_sightings" ADD CONSTRAINT "device_sightings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_sightings_asset_id_index" ON "device_sightings" USING btree ("asset_id");