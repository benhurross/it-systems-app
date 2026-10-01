ALTER TABLE "tickets" ADD COLUMN "channel" text;--> statement-breakpoint
-- How requests reach IT; databases seeded before the list existed get it here.
INSERT INTO "lookups" ("list", "code", "label_en", "label_ar", "sort_order") VALUES
  ('channel', 'app', 'App', 'التطبيق', 0),
  ('channel', 'phone', 'Phone call', 'اتصال هاتفي', 1),
  ('channel', 'mobile', 'Mobile', 'الجوال', 2),
  ('channel', 'email', 'Email', 'البريد الإلكتروني', 3),
  ('channel', 'email_alert', 'Email alert', 'تنبيه بريد إلكتروني', 4),
  ('channel', 'whatsapp', 'WhatsApp', 'واتساب', 5),
  ('channel', 'in_person', 'In person', 'حضورياً', 6)
ON CONFLICT DO NOTHING;
