CREATE TABLE "team_task_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "team_task_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"task_id" integer NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"user_name" text NOT NULL,
	"text" text,
	"progress" smallint,
	"detail" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "team_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text,
	"assignee_id" text,
	"created_by_id" text,
	"created_by_name" text NOT NULL,
	"requester" text DEFAULT 'it_manager' NOT NULL,
	"requester_name" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'todo' NOT NULL,
	"progress" smallint DEFAULT 0 NOT NULL,
	"confidential" boolean DEFAULT false NOT NULL,
	"project_id" integer,
	"started_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_name" text,
	"reminded_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_task_events" ADD CONSTRAINT "team_task_events_task_id_team_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."team_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_task_events" ADD CONSTRAINT "team_task_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_task_events_task_id_index" ON "team_task_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "team_tasks_assignee_id_index" ON "team_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "team_tasks_status_index" ON "team_tasks" USING btree ("status");