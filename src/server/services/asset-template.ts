import { and, asc, eq, inArray } from "drizzle-orm";
import writeXlsxFile, { type Cell, type Row } from "write-excel-file/node";
import { TEMPLATE_HEADERS } from "@/lib/asset-import";
import { ASSET_STATUSES, CRITICALITIES, SUPPORT_STATUSES } from "@/lib/domain";
import { db } from "../db";
import { lookups } from "../db/schema";
import { listRooms } from "./floor-plans";

/**
 * The workbook to fill in the inventory with: an empty Assets sheet with every column the import
 * reads, the values each column takes from the app's lists as they stand, and how to fill it in.
 */

const words = (code: string) => code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export async function assetTemplate() {
  const lists = ["asset_category", "asset_type", "location", "manufacturer", "processor", "storage_type", "operating_system"];
  const rows = await db
    .select({ list: lookups.list, label: lookups.labelEn })
    .from(lookups)
    .where(and(inArray(lookups.list, lists as never[]), eq(lookups.active, true)))
    .orderBy(asc(lookups.sortOrder), asc(lookups.id));
  const of = (list: string) => rows.filter((r) => r.list === list).map((r) => r.label);
  const rooms = [...new Set((await listRooms()).filter((r) => r.planId !== null).map((r) => r.room))];

  const head = (value: string): Cell => ({ value, fontWeight: "bold", backgroundColor: "#DCE6F1", wrap: true, alignVertical: "top" });
  const assets: Row[] = [TEMPLATE_HEADERS.map(head)];

  const columns: [string, string[]][] = [
    ["Category", of("asset_category")],
    ["Type", of("asset_type")],
    ["Location", of("location")],
    // The rooms the floor plans name: one of these puts the asset on its plan.
    ["Room / area", rooms],
    ["Manufacturer", of("manufacturer")],
    ["Status", ASSET_STATUSES.map(words)],
    ["Support", SUPPORT_STATUSES.map(words)],
    ["Criticality", CRITICALITIES.map(words)],
    ["Processor", of("processor")],
    ["Storage type", of("storage_type")],
    ["Operating system", of("operating_system")],
  ];
  const depth = Math.max(...columns.map(([, values]) => values.length));
  const valuesSheet: Row[] = [columns.map(([name]) => head(name)), ...Array.from({ length: depth }, (_, i): Row => columns.map(([, values]) => values[i] ?? null))];

  const sample: Partial<Record<(typeof TEMPLATE_HEADERS)[number], string>> = {
    "Asset Name / Workstation Name": "FIN-PC-07", Category: "End-User Devices", Type: "Laptop", Manufacturer: "Dell", Model: "Latitude 5550",
    Serial: "5CD1234XYZ", Status: "In use", Location: "Jeddah Head Office", "Room / area": "Finance", "Assigned to": "employee@applus.com.sa", Purchased: "2025-01-15",
    "Cost (SAR)": "4500", "Warranty ends": "2028-01-15", Support: "Supported", Criticality: "Medium", "IP address": "192.168.0.57",
    Processor: "Intel Core i7", "RAM (GB)": "16", "Storage size": "512 GB", "Storage type": "SSD (NVMe)",
    "Operating system": "Windows 11 Pro", "Screen (inches)": "15.6",
  };
  const example = TEMPLATE_HEADERS.map((h) => sample[h] ?? "");
  const how: Row[] = [
    [{ value: "Filling in the asset template", fontWeight: "bold", fontSize: 14 }],
    [""],
    ["• One asset per row on the Assets sheet. Required: Asset Name / Workstation Name, Type (or Category) and Location."],
    ["• Leave Tag empty for a new asset: the app gives it the next number (AST-0001, AST-0002…). To update an asset already in the app, write its tag."],
    ["• Category, Type, Location, Manufacturer, Status, Support and Criticality take the values on the Lists sheet."],
    ["• Processor, Storage type and Operating system: preferably as on the Lists sheet (Intel Core i5, SSD (NVMe), Windows 11 Pro). A value not there yet is added to its list when the sheet is loaded; the import page shows which first."],
    ["• RAM in GB (16). Storage size as 512 GB or 1 TB. Storage 2 is for a second drive. Port count is for switches and routers."],
    ["• Room / area: where it is, preferably a room on the Lists sheet (from the floor plans), which also puts it on that plan's map. Any other room can be written."],
    ["• Assigned to: the employee's ID number, email or full name, as in People → Directory. A shared device (meeting room TV, server) has no one: leave it empty and write In use as its Status."],
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
