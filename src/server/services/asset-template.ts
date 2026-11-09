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
    ["Processor brand", Object.values(CPU_BRAND_LABELS)],
    ["Intel families", of("cpu_intel")],
    ["AMD families", of("cpu_amd")],
    ["Apple families", of("cpu_apple")],
    ["Storage type", STORAGE_TYPES.map((t) => STORAGE_LABELS[t])],
    ["Ports", PORTS.map((p) => PORT_LABELS[p])],
    ["Operating system", of("operating_system")],
  ];
  const depth = Math.max(...columns.map(([, values]) => values.length));
  const valuesSheet: Row[] = [columns.map(([name]) => head(name)), ...Array.from({ length: depth }, (_, i): Row => columns.map(([, values]) => values[i] ?? null))];

  const example = [
    "", "FIN-PC-07", "End-User Devices", "Laptop", "Dell", "Latitude 5550", "5CD1234XYZ", "In use", "Jeddah Head Office", "employee@applus.com.sa",
    "2025-01-15", "4500", "2028-01-15", "Supported", "Medium", "192.168.0.57", "", "",
    "Intel", "Core i7", "1355U", "", "16", "512 GB", "SSD (NVMe)", "", "", "USB-C, USB-A, HDMI, Wi-Fi", "Windows 11 Pro", "23H2", "15.6", "", "",
  ];
  const how: Row[] = [
    [{ value: "Filling in the asset template", fontWeight: "bold", fontSize: 14 }],
    [""],
    ["• One asset per row on the Assets sheet. Required: Asset Name / Workstation Name, Type (or Category) and Location."],
    ["• Leave Tag empty for a new asset: the app gives it the next number (AST-0001, AST-0002…). To update an asset already in the app, write its tag."],
    ["• Category, Type, Location, Manufacturer, Status, Support, Criticality, processor, storage type, ports and operating system take the values on the Lists sheet."],
    ["• Processor: the brand (Intel, AMD or Apple), the family from that brand's list (Core i7, Ryzen 5, M2…), and the model (1355U). Or all in Processor family: Intel Core i7-1355U."],
    ["• RAM in GB (16). Storage size as 512 GB or 1 TB. Storage 2 is for a second drive."],
    ["• Ports: the ones the device has, separated by commas (USB-C, HDMI, Network (RJ-45))."],
    ["• Operating system and its version: Windows 11 Pro and 23H2 (or together, Windows 11 Pro 23H2)."],
    ["• Assigned to: the employee's ID number, email or full name, as in People → Directory."],
    ["• Dates as 2026-03-31 or 31/03/2026. Leave a cell empty when it does not apply (a monitor has no processor)."],
    ["• Load it in Assets → Import: the app shows what each row will do before anything is saved."],
    [""],
    [{ value: "Example row (as on the Assets sheet)", fontWeight: "bold" }],
    TEMPLATE_HEADERS.map(head),
    example.slice(0, TEMPLATE_HEADERS.length),
  ];

  return writeXlsxFile([
    { data: assets, sheet: "Assets", columns: TEMPLATE_HEADERS.map((h) => ({ width: Math.max(12, Math.min(30, h.length + 4)) })), stickyRowsCount: 1 },
    { data: valuesSheet, sheet: "Lists", columns: columns.map(() => ({ width: 26 })), stickyRowsCount: 1 },
    { data: how, sheet: "How to fill", columns: [{ width: 120 }, ...TEMPLATE_HEADERS.slice(1).map(() => ({ width: 18 }))] },
  ]).toBuffer();
}
