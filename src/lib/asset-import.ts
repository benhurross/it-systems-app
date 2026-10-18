import type { z } from "zod";
import { ASSET_STATUSES, CRITICALITIES, SUPPORT_STATUSES } from "./domain";
import { assetInput } from "./schemas";

/**
 * Reading an inventory sheet (Excel or CSV) into assets: the columns are those of the inventory
 * export, so a sheet exported, filled in and loaded back updates what it lists. A row with a tag
 * (AST-0042), or the serial number of an asset already registered, updates that asset, its empty
 * cells leaving what is there; any other row adds one. Rows with problems are left out, and say why.
 */

export type Cell = string | number | boolean | Date | null | undefined;
type AssetInput = z.output<typeof assetInput>;
export type ImportField = (typeof FIELDS)[number];

/** Each field and the column names it is found under, compared without case, spaces or signs. */
const COLUMNS = {
  tag: ["tag", "assettag", "assetno", "assetnumber"],
  name: ["name", "assetname", "hostname", "computername", "devicename"],
  category: ["category", "assetcategory"],
  type: ["type", "assettype", "devicetype"],
  manufacturer: ["manufacturer", "make", "brand"],
  model: ["model"],
  serial: ["serial", "serialnumber", "serialno", "sn", "servicetag"],
  status: ["status"],
  location: ["location", "site", "office", "branch"],
  assignedTo: ["assignedto", "user", "employee", "owner", "heldby"],
  purchaseDate: ["purchased", "purchasedate", "purchasedon", "dateofpurchase"],
  purchaseCost: ["cost", "costsar", "price", "purchasecost"],
  warrantyEnd: ["warrantyends", "warrantyend", "warranty", "warrantyexpiry", "warrantyuntil"],
  supportStatus: ["support", "supportstatus", "vendorsupport"],
  criticality: ["criticality"],
  ipAddress: ["ipaddress", "ip"],
  macAddress: ["macaddress", "mac"],
  anydeskId: ["anydeskid", "anydesk"],
  os: ["os", "operatingsystem", "operatingsystemorfirmware", "firmware"],
  notes: ["notes", "remarks", "comments"],
} as const;
export const FIELDS = Object.keys(COLUMNS) as (keyof typeof COLUMNS)[];

/** The columns of the template, as the inventory export names them. */
export const TEMPLATE_HEADERS = [
  "Tag", "Name", "Category", "Type", "Manufacturer", "Model", "Serial", "Status", "Location", "Assigned to",
  "Purchased", "Cost (SAR)", "Warranty ends", "Support", "IP address", "MAC address", "AnyDesk ID",
] as const;

/** Where a type of device goes when the sheet does not say. */
const CATEGORY_OF: Record<string, string> = {
  physical_server: "servers", virtual_server: "servers", storage: "servers", ups: "servers",
  desktop: "end_user", laptop: "end_user", monitor: "end_user",
  printer: "printers", scanner: "printers",
  firewall: "security",
  router: "network", switch: "network", access_point: "network",
  backup_appliance: "backup",
  desk_phone: "communication", pbx: "communication",
  cctv: "monitoring", nvr: "monitoring", access_control: "monitoring",
  application: "software", database: "software",
  cloud_service: "cloud",
};

export type Problem =
  | { code: "noHeader" }
  | { code: "required"; field: ImportField }
  | { code: "unknown"; field: ImportField; value: string }
  | { code: "noTag"; value: string }
  | { code: "person"; value: string }
  | { code: "personAmbiguous"; value: string }
  | { code: "date"; field: ImportField; value: string }
  | { code: "number"; field: ImportField; value: string }
  | { code: "repeated"; field: ImportField; line: number }
  | { code: "invalid"; field: ImportField; message: string };

export type PlannedRow = {
  /** The row's number in the sheet, as Excel shows it. */
  line: number;
  name: string;
  action: "add" | "update" | "unchanged" | "skip";
  assetId: number | null;
  /** For updates, the fields that change. */
  changes: ImportField[];
  problems: Problem[];
  input: AssetInput | null;
};

export type ImportContext = {
  lookups: { list: string; code: string; labelEn: string; labelAr: string }[];
  employees: { id: number; name: string; email: string | null; number: string | null; active: boolean }[];
  assets: (AssetInput & { id: number })[];
};

const key = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function text(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  // The inventory export marks text that starts like a formula with a quote; it is taken off again.
  return String(cell).trim().replace(/^'(?=[=+\-@])/, "");
}

/** A date written as Excel stores it, as 2026-03-31, or day first as 31/03/2026. */
function day(cell: Cell): string | null {
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? null : cell.toISOString().slice(0, 10);
  const v = text(cell);
  const iso8601 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (!iso8601 && !dayFirst) return null;
  const [y, mo, d] = iso8601 ? [iso8601[1], iso8601[2], iso8601[3]] : [dayFirst![3], dayFirst![2], dayFirst![1]];
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

/** The sheet's rows as fields, from the first row naming a Name column. */
export function readAssetSheet(sheet: Cell[][]) {
  const headerAt = sheet.findIndex((row) => row.some((c) => (COLUMNS.name as readonly string[]).includes(key(text(c)))));
  if (headerAt < 0) return { headerAt, columns: {} as Partial<Record<ImportField, number>>, unused: [] as string[], rows: [] };
  const header = sheet[headerAt].map((c) => key(text(c)));
  const columns: Partial<Record<ImportField, number>> = {};
  for (const field of FIELDS) {
    const at = header.findIndex((h) => (COLUMNS[field] as readonly string[]).includes(h));
    if (at >= 0) columns[field] = at;
  }
  const used = new Set(Object.values(columns));
  const unused = sheet[headerAt].map(text).filter((h, i) => h && !used.has(i));
  const rows = sheet
    .slice(headerAt + 1)
    .map((cells, i) => ({ line: headerAt + i + 2, cells }))
    .filter((r) => r.cells.some((c) => text(c) !== ""));
  return { headerAt, columns, unused, rows };
}

/** What loading the sheet would do, row by row, against what is registered. */
export function planImport(sheet: Cell[][], ctx: ImportContext): { rows: PlannedRow[]; unused: string[]; problem: Problem | null } {
  const { headerAt, columns, unused, rows } = readAssetSheet(sheet);
  if (headerAt < 0) return { rows: [], unused: [], problem: { code: "noHeader" } };
  const list = (name: string) => ctx.lookups.filter((l) => l.list === name);
  const byId = new Map(ctx.assets.map((a) => [a.id, a]));
  const bySerial = new Map(ctx.assets.filter((a) => a.serial).map((a) => [key(a.serial!), a]));
  const seen = { asset: new Map<number, number>(), serial: new Map<string, number>() };

  const planned = rows.map(({ line, cells }): PlannedRow => {
    const problems: Problem[] = [];
    const raw = (field: ImportField) => (columns[field] === undefined ? "" : text(cells[columns[field]!]));
    const cell = (field: ImportField) => (columns[field] === undefined ? undefined : cells[columns[field]!]);
    const name = raw("name");

    // Which asset the row is: by its tag, else by a serial already registered.
    let existing: (typeof ctx.assets)[number] | undefined;
    const tag = raw("tag");
    if (tag) {
      const id = Number(/^(?:ast-?)?0*(\d+)$/i.exec(tag)?.[1]);
      existing = byId.get(id);
      if (!existing) problems.push({ code: "noTag", value: tag });
    }
    const serial = raw("serial");
    if (serial) {
      if (seen.serial.has(key(serial))) problems.push({ code: "repeated", field: "serial", line: seen.serial.get(key(serial))! });
      else seen.serial.set(key(serial), line);
      existing ??= tag ? undefined : bySerial.get(key(serial));
    }
    // One asset, named twice (by its tag on one row and its serial on another, say).
    if (existing && !problems.some((p) => p.code === "repeated")) {
      if (seen.asset.has(existing.id)) problems.push({ code: "repeated", field: tag ? "tag" : "serial", line: seen.asset.get(existing.id)! });
      else seen.asset.set(existing.id, line);
    }

    const values: Partial<Record<keyof AssetInput, unknown>> = {};
    const lookup = (field: "category" | "type" | "location" | "manufacturer", listName: string) => {
      const value = raw(field);
      if (!value) return;
      const k = key(value);
      const entries = list(listName);
      const found =
        entries.find((l) => key(l.code) === k || key(l.labelEn) === k || key(l.labelAr) === k) ??
        entries.find((l) => k.length >= 3 && (key(l.labelEn).startsWith(k) || key(l.code).startsWith(k)));
      if (found) values[field] = found.code;
      else problems.push({ code: "unknown", field, value });
    };
    lookup("type", "asset_type");
    lookup("category", "asset_category");
    lookup("location", "location");
    lookup("manufacturer", "manufacturer");

    const choice = (field: "status" | "supportStatus" | "criticality", options: readonly string[]) => {
      const value = raw(field);
      if (!value) return;
      const found = options.find((o) => key(o) === key(value));
      if (found) values[field] = found;
      else problems.push({ code: "unknown", field, value });
    };
    choice("status", ASSET_STATUSES);
    choice("supportStatus", SUPPORT_STATUSES);
    choice("criticality", CRITICALITIES);

    const person = raw("assignedTo");
    if (person) {
      const k = key(person);
      const byNumber = ctx.employees.filter((e) => e.number && key(e.number) === k);
      const byEmail = ctx.employees.filter((e) => e.email && e.email.toLowerCase() === person.toLowerCase());
      const byName = ctx.employees.filter((e) => key(e.name) === k);
      const named = byNumber.length ? byNumber : byEmail.length ? byEmail : byName.filter((e) => e.active).length ? byName.filter((e) => e.active) : byName;
      if (named.length === 1) values.assignedTo = named[0].id;
      else problems.push({ code: named.length ? "personAmbiguous" : "person", value: person });
    }

    for (const field of ["purchaseDate", "warrantyEnd"] as const) {
      if (!raw(field)) continue;
      const d = day(cell(field));
      if (d) values[field] = d;
      else problems.push({ code: "date", field, value: raw(field) });
    }
    if (raw("purchaseCost")) {
      const n = typeof cell("purchaseCost") === "number" ? (cell("purchaseCost") as number) : Number(raw("purchaseCost").replace(/[^\d.]/g, ""));
      if (Number.isFinite(n) && /\d/.test(raw("purchaseCost"))) values.purchaseCost = n;
      else problems.push({ code: "number", field: "purchaseCost", value: raw("purchaseCost") });
    }
    for (const field of ["name", "model", "serial", "ipAddress", "macAddress", "anydeskId", "os", "notes"] as const) {
      if (raw(field)) values[field] = raw(field);
    }

    // Updates start from what is there; new assets from sensible defaults.
    const base: Partial<AssetInput> = existing ?? {
      status: values.assignedTo ? "in_use" : "in_stock",
      supportStatus: "supported",
      monitorMethod: "none",
      assignedTo: null,
      purchaseId: null,
    };
    const merged: Record<string, unknown> = { ...base, ...values };
    // Handed to someone, as Move would: in use, unless the sheet says otherwise.
    if (existing && values.assignedTo !== undefined && values.assignedTo !== existing.assignedTo && !values.status) merged.status = "in_use";
    if (!merged.category && typeof merged.type === "string") merged.category = CATEGORY_OF[merged.type];
    merged.criticality ??= merged.category === "end_user" || merged.category === "printers" ? "low" : "medium";
    for (const field of ["name", "type", "location"] as const) {
      if (!merged[field] && !problems.some((p) => "field" in p && p.field === field)) problems.push({ code: "required", field });
    }
    if (!merged.category && !problems.some((p) => "field" in p && (p.field === "category" || p.field === "type"))) {
      problems.push({ code: "required", field: "category" });
    }

    let input: AssetInput | null = null;
    if (problems.length === 0) {
      const parsed = assetInput.safeParse(merged);
      if (parsed.success) input = parsed.data;
      else for (const issue of parsed.error.issues) problems.push({ code: "invalid", field: issue.path[0] as ImportField, message: issue.message });
    }
    const changes = existing && input ? FIELDS.filter((f) => f !== "tag" && f in input! && !same(input![f as keyof AssetInput], existing![f as keyof AssetInput])) : [];
    return {
      line,
      name: name || existing?.name || "",
      action: problems.length ? "skip" : existing ? (changes.length ? "update" : "unchanged") : "add",
      assetId: existing?.id ?? null,
      changes,
      problems,
      input: problems.length ? null : input,
    };
  });
  return { rows: planned, unused, problem: null };
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || String(a) === String(b);
