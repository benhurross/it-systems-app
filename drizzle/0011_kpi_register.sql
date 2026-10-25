CREATE TABLE "api_tokens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "kpi_figures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kpi_figures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kpi_id" integer NOT NULL,
	"year" integer NOT NULL,
	"period" smallint NOT NULL,
	"numerator" numeric(14, 4),
	"denominator" numeric(14, 4),
	"value" numeric(14, 4),
	"note" text DEFAULT '' NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_figures_kpiId_year_period_unique" UNIQUE("kpi_id","year","period")
);
--> statement-breakpoint
CREATE TABLE "kpi_years" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kpi_years_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kpi_id" integer NOT NULL,
	"year" integer NOT NULL,
	"baseline" numeric(12, 4),
	"baseline_note" text DEFAULT '' NOT NULL,
	"target" numeric(12, 4) NOT NULL,
	"weight" numeric(6, 2),
	CONSTRAINT "kpi_years_kpiId_year_unique" UNIQUE("kpi_id","year")
);
--> statement-breakpoint
CREATE TABLE "kpis" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kpis_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'department' NOT NULL,
	"department" text DEFAULT 'IT' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"owner_id" text,
	"definition" text DEFAULT '' NOT NULL,
	"formula" text DEFAULT '' NOT NULL,
	"higher_is_better" boolean DEFAULT true NOT NULL,
	"frequency" text DEFAULT '' NOT NULL,
	"period" text DEFAULT 'month' NOT NULL,
	"unit" text DEFAULT 'percent' NOT NULL,
	"target_for" text DEFAULT 'period' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_source" text DEFAULT '' NOT NULL,
	"reviewer" text DEFAULT '' NOT NULL,
	"red_flag" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpis_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "kpi_figures" ADD CONSTRAINT "kpi_figures_kpi_id_kpis_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_years" ADD CONSTRAINT "kpi_years_kpi_id_kpis_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;