import { and, asc, eq, inArray } from "drizzle-orm";
import writeXlsxFile, { type Cell, type Row } from "write-excel-file/node";
import { CPU_BRAND_LABELS, PORT_LABELS, PORTS, STORAGE_LABELS, STORAGE_TYPES } from "@/lib/asset-specs";
import { TEMPLATE_HEADERS } from "@/lib/asset-import";
import { ASSET_STATUSES, CRITICALITIES, SUPPORT_STATUSES } from "@/lib/domain";
import { db } from "../db";
import { lookups } from "../db/schema";

/**
 * The workbook to fill in the inventory with: an empty Assets sheet with every column the import
 * reads, the values each column takes from the app's lists as they stand, and how to fill it in.
 */

const words = (code: string) => code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export async function assetTemplate() {
  const lists = ["asset_category", "asset_type", "location", "manufacturer", "cpu_intel", "cpu_amd", "cpu_apple", "operating_system"];
  const rows = await db
    .select({ list: lookups.list, label: lookups.labelEn })
    .from(lookups)
    .where(and(inArray(lookups.list, lists as never[]), eq(lookups.active, true)))
    .orderBy(asc(lookups.sortOrder), asc(lookups.id));
  const of = (list: string) => rows.filter((r) => r.list === list).map((r) => r.label);

  const head = (value: string): Cell => ({ value, fontWeight: "bold", backgroundColor: "#DCE6F1", wrap: true, alignVertical: "top" });
  const assets: Row[] = [TEMPLATE_HEADERS.map(head)];

  const columns: [string, string[]][] = [
    ["Category", of("asset_category")],
    ["Type", of("asset_type")],
    ["Location", of("location")],
    ["Manufacturer", of("manufacturer")],
    ["Status", ASSET_STATUSES.map(words)],
    ["Support", SUPPORT_STATUSES.map(words)],
    ["Criticality", CRITICALITIES.map(words)],
    // "Intel Core i5", "Apple M2": each brand's list, as the asset form offers them.
    ["Processor", (["intel", "amd", "apple"] as const).flatMap((b) => of(`cpu_${b}`).map((l) => `${CPU_BRAND_LABELS[b]} ${l}`))],
    ["Storage type", STORAGE_TYPES.map((t) => STORAGE_LABELS[t])],
    ["Ports", PORTS.map((p) => PORT_LABELS[p])],
    ["Operating system", of("operating_system")],
  ];
  const depth = Math.max(...columns.map(([, values]) => values.length));
  const valuesSheet: Row[] = [columns.map(([name]) => head(name)), ...Array.from({ length: depth }, (_, i): Row => columns.map(([, values]) => values[i] ?? null))];

  const sample: Partial<Record<(typeof TEMPLATE_HEADERS)[number], string>> = {
    "Asset Name / Workstation Name": "FIN-PC-07", Category: "End-User Devices", Type: "Laptop", Manufacturer: "Dell", Model: "Latitude 5550",
    Serial: "5CD1234XYZ", Status: "In use", Location: "Jeddah Head Office", "Assigned to": "employee@applus.com.sa", Purchased: "2025-01-15",
    "Cost (SAR)": "4500", "Warranty ends": "2028-01-15", Support: "Supported", Criticality: "Medium", "IP address": "192.168.0.57",
    Processor: "Intel Core i7", "RAM (GB)": "16", "Storage size": "512 GB", "Storage type": "SSD (NVMe)", Ports: "USB-C, USB-A, HDMI, Wi-Fi",
    "Operating system": "Windows 11 Pro", "Screen (inches)": "15.6",
  };
  const example = TEMPLATE_HEADERS.map((h) => sample[h] ?? "");
  const how: Row[] = [
    [{ value: "Filling in the asset template", fontWeight: "bold", fontSize: 14 }],
    [""],
    ["• One asset per row on the Assets sheet. Required: Asset Name / Workstation Name, Type (or Category) and Location."],
    ["• Leave Tag empty for a new asset: the app gives it the next number (AST-0001, AST-0002…). To update an asset already in the app, write its tag."],
    ["• Category, Type, Location, Manufacturer, Status, Support, Criticality, processor, storage type, ports and operating system take the values on the Lists sheet."],
    ["• Processor: as on the Lists sheet, the brand and family together: Intel Core i5, AMD Ryzen 7, Apple M2."],
    ["• RAM in GB (16). Storage size as 512 GB or 1 TB. Storage 2 is for a second drive."],
    ["• Ports: the ones the device has, separated by commas (USB-C, HDMI, Network (RJ-45))."],
    ["• Operating system: as on the Lists sheet, for example Windows 11 Pro."],
    ["• Assigned to: the employee's ID number, email or full name, as in People → Directory."],
    ["• Dates as 2026-03-31 or 31/03/2026. Leave a cell empty when it does not apply (a monitor has no processor)."],
    ["• Load it in Assets → Import: the app shows what each row will do before anything is saved."],
    [""],
    [{ value: "Example row (as on the Assets sheet)", fontWeight: "bold" }],
    TEMPLATE_HEADERS.map(head),
    example,
  ];

  return writeXlsxFile([
    { data: assets, sheet: "Assets", columns: TEMPLATE_HEADERS.map((h) => ({ width: Math.max(12, Math.min(30, h.length + 4)) })), stickyRowsCount: 1 },
    { data: valuesSheet, sheet: "Lists", columns: columns.map(() => ({ width: 26 })), stickyRowsCount: 1 },
    { data: how, sheet: "How to fill", columns: [{ width: 120 }, ...TEMPLATE_HEADERS.slice(1).map(() => ({ width: 18 }))] },
  ]).toBuffer();
}
