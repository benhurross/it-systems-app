CREATE TABLE "id_cards" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "id_cards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_id" integer,
	"joiner_id" integer,
	"ticket_id" integer,
	"reason" text NOT NULL,
	"note" text,
	"photo_key" text,
	"name" text NOT NULL,
	"designation" text NOT NULL,
	"number" text,
	"name_font" text DEFAULT 'auto' NOT NULL,
	"name_size" real,
	"designation_font" text DEFAULT 'auto' NOT NULL,
	"designation_size" real,
	"status" text DEFAULT 'requested' NOT NULL,
	"printed_at" timestamp with time zone,
	"printed_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "id_cards" ADD CONSTRAINT "id_cards_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_cards" ADD CONSTRAINT "id_cards_joiner_id_joiners_id_fk" FOREIGN KEY ("joiner_id") REFERENCES "public"."joiners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_cards" ADD CONSTRAINT "id_cards_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_cards" ADD CONSTRAINT "id_cards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "id_cards_employee_id_index" ON "id_cards" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "id_cards_joiner_id_index" ON "id_cards" USING btree ("joiner_id");--> statement-breakpoint
CREATE INDEX "id_cards_ticket_id_index" ON "id_cards" USING btree ("ticket_id");--> statement-breakpoint
-- ID card requests are tickets of their own issue type; databases seeded before it existed get it here.
INSERT INTO "lookups" ("list", "code", "label_en", "label_ar", "sort_order") VALUES ('issue_type', 'id_card', 'ID card', 'بطاقة الهوية', 8) ON CONFLICT DO NOTHING;
