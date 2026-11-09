import { assetSpecs, codeOf, driveSize, HARDWARE_LISTS, type AssetSpecs } from "./asset-specs";

/**
 * Reading an inventory sheet's hardware columns: processor ("Intel Core i5-1135G7"), memory, drives
 * ("512 GB", "1TB", "SSD (NVMe)"), operating system ("Windows 11 Pro"), screen. The processor, storage
 * type and system are matched to their lists (Settings → Lists) by name or code, loosely; a value
 * none matches is added to its list, as IT would add it from the asset form.
 */

type Lookup = { list: string; code: string; labelEn: string; labelAr: string };
export type HardwareList = (typeof HARDWARE_LISTS)[number];
/** A value a sheet names that its list does not have yet: added when the sheet is loaded. */
export type NewListValue = { list: HardwareList; code: string; label: string };

const key = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export type SpecProblem = { field: string; value: string };

/** "512", "512 GB", "1TB", "1.5 TB": a size and its unit; null for anything else. */
export function readSize(value: string): { size: number; unit: "GB" | "TB" } | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*(gb|g|tb|t)?$/i.exec(value.trim());
  if (!m) return null;
  const size = Number(m[1].replace(",", "."));
  if (!(size > 0)) return null;
  return { size, unit: m[2] && /^t/i.test(m[2]) ? "TB" : "GB" };
}

/** The entry of a list a value names: by name or code, else the longest name it contains or starts with. */
export function findInList(list: HardwareList, value: string, lookups: Lookup[]): Lookup | null {
  const k = key(value);
  if (!k) return null;
  const entries = lookups.filter((l) => l.list === list);
  const exact = entries.find((l) => key(l.code) === k || key(l.labelEn) === k || key(l.labelAr) === k);
  if (exact) return exact;
  const longest = (found: Lookup[]) => found.sort((a, b) => b.labelEn.length - a.labelEn.length)[0] ?? null;
  if (list === "operating_system") return longest(entries.filter((l) => k.startsWith(key(l.labelEn))));
  if (list === "processor") {
    // "Intel Core i5-1135G7" is an Intel Core i5; "Core i5" too.
    return longest(entries.filter((l) => k.includes(key(l.labelEn)))) ?? longest(entries.filter((l) => k.length >= 4 && key(l.labelEn).endsWith(k)));
  }
  // Storage: "NVMe" or "M.2" is an NVMe SSD, a plain "SSD" a SATA one, "Hard disk" an HDD.
  const like = k.includes("nvme") || k.includes("m2") ? "nvme" : k.includes("ssd") || k.includes("sata") ? "sata" : k.includes("hdd") || k.includes("harddisk") ? "hdd" : null;
  return like ? (entries.find((l) => key(l.code).includes(like) || key(l.labelEn).includes(like)) ?? null) : null;
}

/**
 * The code a value takes in its list: its entry's, or a new one, recorded in `added`, which a whole
 * sheet shares so a value named on many rows is added once.
 */
export function listCode(list: HardwareList, value: string, lookups: Lookup[], added: NewListValue[]): string {
  const found = findInList(list, value, lookups);
  if (found) return found.code;
  const label = value.trim().slice(0, 100);
  const again = added.find((a) => a.list === list && key(a.label) === key(label));
  if (again) return again.code;
  const taken = new Set([...lookups.filter((l) => l.list === list).map((l) => l.code), ...added.filter((a) => a.list === list).map((a) => a.code)]);
  const base = codeOf(label);
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}_${n}`;
  added.push({ list, code, label });
  return code;
}

type Raw = (field: string) => string;

/**
 * The hardware a row gives, laid over what the asset has (an update leaves what the sheet does not
 * say), and the values that could not be read. Values new to a list go in `added`.
 */
export function readSpecs(raw: Raw, base: AssetSpecs, lookups: Lookup[], added: NewListValue[] = []) {
  const specs: AssetSpecs = { ...base, drives: [...base.drives] };
  const problems: SpecProblem[] = [];

  if (raw("processor")) specs.cpu = listCode("processor", raw("processor"), lookups, added);
  if (raw("os")) specs.os = listCode("operating_system", raw("os"), lookups, added);

  for (const [field, set] of [
    ["vcpus", (n: number) => (specs.vcpus = Math.round(n))],
    ["ramGb", (n: number) => (specs.ramGb = n)],
    ["screen", (n: number) => (specs.screenInches = n)],
    ["portCount", (n: number) => (specs.portCount = Math.round(n))],
  ] as const) {
    const v = raw(field);
    if (!v) continue;
    const n = Number(v.replace(/[^\d.,]/g, "").replace(",", "."));
    if (n > 0) set(n);
    else problems.push({ field, value: v });
  }

  for (const [i, sizeField, typeField] of [
    [0, "drive1", "drive1Type"],
    [1, "drive2", "drive2Type"],
  ] as const) {
    const sizeText = raw(sizeField);
    const typeText = raw(typeField);
    if (!sizeText && !typeText) continue;
    const drive = { ...(specs.drives[i] ?? { size: null, unit: "GB" as const, type: "" }) };
    if (sizeText) {
      const s = readSize(sizeText);
      if (s) Object.assign(drive, s);
      else problems.push({ field: sizeField, value: sizeText });
    }
    if (typeText) drive.type = listCode("storage_type", typeText, lookups, added);
    while (specs.drives.length < i) specs.drives.push({ size: null, unit: "GB", type: "" });
    specs.drives[i] = drive;
  }
  return { specs, problems };
}

/**
 * The hardware columns of an inventory export, named as the template names them (HARDWARE_HEADERS),
 * so an export, filled in, loads back. `label` gives a list value's name.
 */
export function hardwareColumns(label: (list: HardwareList, code: string) => string) {
  type A = { specs?: unknown; os?: string | null };
  const s = (a: A) => assetSpecs.parse(a.specs ?? {});
  const drive = (a: A, i: number) => s(a).drives[i];
  const kind = (a: A, i: number) => (drive(a, i)?.type ? label("storage_type", drive(a, i).type) : "");
  return [
    { header: "Processor", value: (a: A) => (s(a).cpu ? label("processor", s(a).cpu) : "") },
    { header: "vCPUs", value: (a: A) => s(a).vcpus },
    { header: "RAM (GB)", value: (a: A) => s(a).ramGb },
    { header: "Storage size", value: (a: A) => (drive(a, 0) ? driveSize(drive(a, 0)) : "") },
    { header: "Storage type", value: (a: A) => kind(a, 0) },
    { header: "Storage 2 size", value: (a: A) => (drive(a, 1) ? driveSize(drive(a, 1)) : "") },
    { header: "Storage 2 type", value: (a: A) => kind(a, 1) },
    { header: "Operating system", value: (a: A) => (s(a).os ? label("operating_system", s(a).os) : (a.os ?? "")) },
    { header: "Screen (inches)", value: (a: A) => s(a).screenInches },
    { header: "Port count", value: (a: A) => s(a).portCount },
  ];
}
