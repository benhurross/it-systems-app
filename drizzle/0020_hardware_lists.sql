-- The processor is one list ("Intel Core i5"), in place of a list for each brand, and storage
-- types become a list too: both editable in Settings → Lists and from the asset form.
INSERT INTO "lookups" ("list", "code", "label_en", "label_ar", "sort_order", "active")
SELECT 'processor',
       replace("list", 'cpu_', '') || '_' || "code",
       CASE "list" WHEN 'cpu_intel' THEN 'Intel ' WHEN 'cpu_amd' THEN 'AMD ' ELSE 'Apple ' END || "label_en",
       CASE "list" WHEN 'cpu_intel' THEN 'Intel ' WHEN 'cpu_amd' THEN 'AMD ' ELSE 'Apple ' END || "label_ar",
       CASE "list" WHEN 'cpu_intel' THEN 0 WHEN 'cpu_amd' THEN 100 ELSE 200 END + "sort_order",
       "active"
FROM "lookups"
WHERE "list" IN ('cpu_intel', 'cpu_amd', 'cpu_apple')
ON CONFLICT ("list", "code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "lookups" ("list", "code", "label_en", "label_ar", "sort_order") VALUES
('processor', 'intel_core_i3', 'Intel Core i3', 'Intel Core i3', 0),
('processor', 'intel_core_i5', 'Intel Core i5', 'Intel Core i5', 1),
('processor', 'intel_core_i7', 'Intel Core i7', 'Intel Core i7', 2),
('processor', 'intel_core_i9', 'Intel Core i9', 'Intel Core i9', 3),
('processor', 'amd_ryzen_3', 'AMD Ryzen 3', 'AMD Ryzen 3', 100),
('processor', 'amd_ryzen_5', 'AMD Ryzen 5', 'AMD Ryzen 5', 101),
('processor', 'amd_ryzen_7', 'AMD Ryzen 7', 'AMD Ryzen 7', 102),
('processor', 'amd_ryzen_9', 'AMD Ryzen 9', 'AMD Ryzen 9', 103),
('processor', 'apple_m1', 'Apple M1', 'Apple M1', 200),
('processor', 'apple_m2', 'Apple M2', 'Apple M2', 201),
('processor', 'apple_m3', 'Apple M3', 'Apple M3', 202),
('processor', 'apple_m4', 'Apple M4', 'Apple M4', 203),
('storage_type', 'ssd_nvme', 'SSD (NVMe)', 'SSD (NVMe)', 0),
('storage_type', 'ssd_sata', 'SSD (SATA)', 'SSD (SATA)', 1),
('storage_type', 'hdd', 'HDD', 'HDD', 2)
ON CONFLICT ("list", "code") DO NOTHING;
--> statement-breakpoint
-- Each asset's processor, as its code in the one list; ports, the processor model and the
-- system's version are no longer kept.
UPDATE "assets"
SET "specs" = ("specs" - 'cpuBrand' - 'cpuFamily' - 'cpuModel' - 'osVersion' - 'ports')
  || CASE WHEN coalesce("specs"->>'cpuBrand', '') <> '' AND coalesce("specs"->>'cpuFamily', '') <> ''
          THEN jsonb_build_object('cpu', ("specs"->>'cpuBrand') || '_' || ("specs"->>'cpuFamily'))
          ELSE '{}'::jsonb END
WHERE "specs" ?| ARRAY['cpuBrand', 'cpuFamily', 'cpuModel', 'osVersion', 'ports'];
--> statement-breakpoint
DELETE FROM "lookups" WHERE "list" IN ('cpu_intel', 'cpu_amd', 'cpu_apple');
