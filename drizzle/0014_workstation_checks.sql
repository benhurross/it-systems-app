CREATE TABLE "workstation_checks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workstation_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"asset_id" integer,
	"computer_name" text NOT NULL,
	"employee_id" integer,
	"employee_name" text,
	"result" text NOT NULL,
	"items" jsonb NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"checked_by" text,
	"checked_by_name" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_code_hash" text,
	"read_at" timestamp with time zone,
	"read_by" text,
	"read_on" text
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "scope" text DEFAULT 'kpis' NOT NULL;--> statement-breakpoint
ALTER TABLE "workstation_checks" ADD CONSTRAINT "workstation_checks_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstation_checks" ADD CONSTRAINT "workstation_checks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstation_checks" ADD CONSTRAINT "workstation_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workstation_checks_employee_id_index" ON "workstation_checks" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "workstation_checks_computer_name_index" ON "workstation_checks" USING btree ("computer_name");--> statement-breakpoint
CREATE INDEX "workstation_checks_asset_id_index" ON "workstation_checks" USING btree ("asset_id");--> statement-breakpoint
-- The starting checklist, which admins change in Settings → Lists.
INSERT INTO "lookups" ("list", "code", "label_en", "label_ar", "sort_order") VALUES
('workstation_check', 'screen_lock', 'Screen locks when away (Win+L; auto-lock after 5–10 minutes)', 'تُقفل الشاشة عند الابتعاد (Win+L، والقفل التلقائي بعد 5–10 دقائق)', 0),
('workstation_check', 'no_written_passwords', 'No passwords written down (sticky notes, under the keyboard, on the monitor)', 'لا كلمات مرور مكتوبة (أوراق لاصقة، تحت لوحة المفاتيح، على الشاشة)', 1),
('workstation_check', 'antivirus', 'Antivirus running and up to date', 'برنامج مكافحة الفيروسات يعمل ومحدّث', 2),
('workstation_check', 'windows_updates', 'Windows updates installed (no restart pending for more than a week)', 'تحديثات Windows مثبّتة (لا إعادة تشغيل معلّقة لأكثر من أسبوع)', 3),
('workstation_check', 'approved_software', 'No unapproved software or browser extensions', 'لا برامج أو إضافات متصفح غير معتمدة', 4),
('workstation_check', 'no_usb', 'No personal USB drives or unknown devices connected', 'لا أجهزة USB شخصية أو أجهزة غير معروفة موصولة', 5),
('workstation_check', 'files_on_server', 'Company files saved on the server / OneDrive, not only the desktop', 'ملفات الشركة محفوظة على الخادم أو OneDrive وليس على سطح المكتب فقط', 6),
('workstation_check', 'clean_desk', 'No confidential papers left on the desk (clean desk)', 'لا أوراق سرية متروكة على المكتب (مكتب نظيف)', 7),
('workstation_check', 'asset_tag', 'Asset tag present and readable', 'ملصق الأصل موجود وواضح', 8),
('workstation_check', 'cables', 'Cables tidy and safe (no trip hazards, no damaged cables)', 'الكابلات مرتبة وآمنة (لا خطر تعثّر ولا كابلات تالفة)', 9),
('workstation_check', 'clean_equipment', 'Equipment clean; no food or drink near the computer', 'الأجهزة نظيفة، ولا طعام أو شراب قرب الحاسوب', 10),
('workstation_check', 'good_condition', 'PC and monitors in good condition (no damage, vents clear)', 'الحاسوب والشاشات بحالة جيدة (لا أضرار، وفتحات التهوية غير مسدودة)', 11)
ON CONFLICT ("list", "code") DO NOTHING;
