CREATE TABLE "it_forms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "it_forms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"employee_id" integer,
	"employee_name" text DEFAULT '' NOT NULL,
	"asset_id" integer,
	"data" jsonb NOT NULL,
	"created_by" text,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "it_forms" ADD CONSTRAINT "it_forms_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_forms" ADD CONSTRAINT "it_forms_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_forms" ADD CONSTRAINT "it_forms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "it_forms_employee_id_index" ON "it_forms" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "it_forms_kind_index" ON "it_forms" USING btree ("kind");