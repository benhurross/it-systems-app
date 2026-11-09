ALTER TABLE "assets" ADD COLUMN "specs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Processor families and operating systems for the asset form, which admins change in Settings → Lists.
INSERT INTO "lookups" ("list", "code", "label_en", "label_ar", "sort_order") VALUES
('cpu_intel', 'core_i3', 'Core i3', 'Core i3', 0),
('cpu_intel', 'core_i5', 'Core i5', 'Core i5', 1),
('cpu_intel', 'core_i7', 'Core i7', 'Core i7', 2),
('cpu_intel', 'core_i9', 'Core i9', 'Core i9', 3),
('cpu_amd', 'ryzen_3', 'Ryzen 3', 'Ryzen 3', 0),
('cpu_amd', 'ryzen_5', 'Ryzen 5', 'Ryzen 5', 1),
('cpu_amd', 'ryzen_7', 'Ryzen 7', 'Ryzen 7', 2),
('cpu_amd', 'ryzen_9', 'Ryzen 9', 'Ryzen 9', 3),
('cpu_apple', 'm1', 'M1', 'M1', 0),
('cpu_apple', 'm2', 'M2', 'M2', 1),
('cpu_apple', 'm3', 'M3', 'M3', 2),
('cpu_apple', 'm4', 'M4', 'M4', 3),
('operating_system', 'win11_pro', 'Windows 11 Pro', 'Windows 11 Pro', 0),
('operating_system', 'win11_home', 'Windows 11 Home', 'Windows 11 Home', 1),
('operating_system', 'win10_pro', 'Windows 10 Pro', 'Windows 10 Pro', 2),
('operating_system', 'win10_home', 'Windows 10 Home', 'Windows 10 Home', 3),
('operating_system', 'macos', 'macOS', 'macOS', 4),
('operating_system', 'ubuntu', 'Ubuntu', 'Ubuntu', 5),
('operating_system', 'linux_other', 'Linux (other)', 'لينكس (أخرى)', 6),
('operating_system', 'win_server_2016', 'Windows Server 2016', 'Windows Server 2016', 7),
('operating_system', 'win_server_2019', 'Windows Server 2019', 'Windows Server 2019', 8),
('operating_system', 'win_server_2022', 'Windows Server 2022', 'Windows Server 2022', 9),
('operating_system', 'win_server_2025', 'Windows Server 2025', 'Windows Server 2025', 10),
('operating_system', 'esxi', 'VMware ESXi', 'VMware ESXi', 11),
('operating_system', 'firmware', 'Vendor firmware', 'برنامج الشركة المصنّعة', 12)
ON CONFLICT ("list", "code") DO NOTHING;
