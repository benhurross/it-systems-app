import {
  assetSpecs,
  CPU_BRAND_LABELS,
  CPU_BRANDS,
  CPU_LIST,
  driveSize,
  PORT_LABELS,
  PORTS,
  STORAGE_LABELS,
  STORAGE_TYPES,
  type AssetSpecs,
  type CpuBrand,
  type Port,
} from "./asset-specs";

/**
 * Reading an inventory sheet's hardware columns: processor (brand, family and model, or all in one
 * "Intel Core i5-1135G7"), memory, drives ("512 GB", "1TB"), ports ("USB-C, HDMI"), operating system
 * ("Windows 11 Pro 23H2"), screen. Values are matched to the app's lists by name or code, loosely.
 */

type Lookup = { list: string; code: string; labelEn: string; labelAr: string };
const key = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export type SpecProblem = { field: string; value: string };

/** "512", "512 GB", "1TB", "1.5 TB": a size and its unit; null for anything else. */
export function readSize(
  value: string,
): { size: number; unit: "GB" | "TB" } | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*(gb|g|tb|t)?$/i.exec(value.trim());
  if (!m) return null;
  const size = Number(m[1].replace(",", "."));
  if (!(size > 0)) return null;
  return { size, unit: m[2] && /^t/i.test(m[2]) ? "TB" : "GB" };
}

/** "SSD (NVMe)", "NVMe", "SSD", "HDD", or the code. A plain SSD is taken as SATA. */
export function readStorageType(
  value: string,
): (typeof STORAGE_TYPES)[number] | null {
  const k = key(value);
  if (!k) return null;
  const byName = STORAGE_TYPES.find(
    (t) => key(t) === k || key(STORAGE_LABELS[t]) === k,
  );
  if (byName) return byName;
  if (k.includes("nvme") || k.includes("m2")) return "ssd_nvme";
  if (k.includes("ssd") || k.includes("sata")) return "ssd_sata";
  if (k.includes("hdd") || k.includes("harddisk")) return "hdd";
  return null;
}

/** "USB-C, HDMI; Network (RJ-45)": the ports named, and any not known. */
export function readPorts(value: string): { ports: Port[]; unknown: string[] } {
  const ports: Port[] = [];
  const unknown: string[] = [];
  for (const part of value
    .split(/[,;|\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    const k = key(part);
    const found =
      PORTS.find((p) => key(p) === k || key(PORT_LABELS[p]) === k) ??
      (k === "rj45" || k === "lan"
        ? "ethernet"
        : k === "wifi"
          ? "wifi"
          : undefined);
    if (found) {
      if (!ports.includes(found)) ports.push(found);
    } else unknown.push(part);
  }
  return { ports, unknown };
}

const brandOf = (value: string): CpuBrand | null => {
  const k = key(value);
  return CPU_BRANDS.find((b) => k === b || k.startsWith(b)) ?? null;
};

/** A family in a brand's list, by name or code; with no brand given, the brand it is in. */
function familyOf(value: string, brand: CpuBrand | null, lookups: Lookup[]) {
  const k = key(value);
  for (const b of brand ? [brand] : CPU_BRANDS) {
    const found = lookups
      .filter((l) => l.list === CPU_LIST[b])
      .find((l) => key(l.code) === k || key(l.labelEn) === k);
    if (found) return { brand: b, family: found.code };
  }
  return null;
}

/** "Intel Core i5-1135G7", "AMD Ryzen 7 5700U", "Apple M2 Pro": brand, the longest family named, and the rest. */
export function readProcessor(value: string, lookups: Lookup[]) {
  const text = value.trim();
  let brand = brandOf(text.split(/\s+/)[0] ?? "");
  const lower = text.toLowerCase();
  let best: { brand: CpuBrand; code: string; label: string } | null = null;
  for (const b of brand ? [brand] : CPU_BRANDS) {
    for (const l of lookups.filter((x) => x.list === CPU_LIST[b])) {
      if (
        lower.includes(l.labelEn.toLowerCase()) &&
        (!best || l.labelEn.length > best.label.length)
      )
        best = { brand: b, code: l.code, label: l.labelEn };
    }
  }
  brand ??= best?.brand ?? null;
  let model = text;
  if (brand) model = model.replace(new RegExp(`^${brand}\\b`, "i"), "");
  if (best)
    model = model.replace(
      new RegExp(best.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      "",
    );
  return {
    brand,
    family: best?.code ?? "",
    model: model.replace(/^[\s\-–]+|[\s\-–]+$/g, ""),
  };
}

/** "Windows 11 Pro 23H2": the system in the list it starts with (the longest), and the version after it. */
export function readOs(value: string, lookups: Lookup[]) {
  const text = value.trim();
  const lower = text.toLowerCase();
  const found = lookups
    .filter((l) => l.list === "operating_system")
    .filter(
      (l) =>
        lower.startsWith(l.labelEn.toLowerCase()) || key(l.code) === key(text),
    )
    .sort((a, b) => b.labelEn.length - a.labelEn.length)[0];
  if (!found) return null;
  return {
    os: found.code,
    version:
      key(found.code) === key(text)
        ? ""
        : text.slice(found.labelEn.length).trim(),
  };
}

type Raw = (field: string) => string;

/**
 * The hardware a row gives, laid over what the asset has (an update leaves what the sheet does not
 * say), and the values that could not be read.
 */
export function readSpecs(raw: Raw, base: AssetSpecs, lookups: Lookup[]) {
  const specs: AssetSpecs = {
    ...base,
    drives: [...base.drives],
    ports: [...base.ports],
  };
  const problems: SpecProblem[] = [];
  let osText: string | null = null;

  if (raw("processor") && !raw("cpuBrand") && !raw("cpuFamily")) {
    const p = readProcessor(raw("processor"), lookups);
    if (p.brand) {
      specs.cpuBrand = p.brand;
      specs.cpuFamily = p.family;
      specs.cpuModel = p.model;
    } else problems.push({ field: "processor", value: raw("processor") });
  }
  if (raw("cpuBrand")) {
    const b = brandOf(raw("cpuBrand"));
    if (b) specs.cpuBrand = b;
    else problems.push({ field: "cpuBrand", value: raw("cpuBrand") });
  }
  if (raw("cpuFamily")) {
    const f = familyOf(
      raw("cpuFamily"),
      raw("cpuBrand") ? specs.cpuBrand || null : null,
      lookups,
    );
    if (f) {
      specs.cpuBrand = f.brand;
      specs.cpuFamily = f.family;
    } else problems.push({ field: "cpuFamily", value: raw("cpuFamily") });
  }
  if (raw("cpuModel")) specs.cpuModel = raw("cpuModel");

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
    const drive = {
      ...(specs.drives[i] ?? {
        size: null,
        unit: "GB" as const,
        type: "" as const,
      }),
    };
    if (sizeText) {
      const s = readSize(sizeText);
      if (s) Object.assign(drive, s);
      else problems.push({ field: sizeField, value: sizeText });
    }
    if (typeText) {
      const t = readStorageType(typeText);
      if (t) drive.type = t;
      else problems.push({ field: typeField, value: typeText });
    }
    while (specs.drives.length < i)
      specs.drives.push({ size: null, unit: "GB", type: "" });
    specs.drives[i] = drive;
  }

  if (raw("ports")) {
    const { ports, unknown } = readPorts(raw("ports"));
    specs.ports = ports;
    for (const u of unknown) problems.push({ field: "ports", value: u });
  }

  if (raw("os")) {
    const o = readOs(raw("os"), lookups);
    if (o) {
      specs.os = o.os;
      specs.osVersion = raw("osVersion") || o.version;
    } else osText = raw("os");
  }
  if (raw("osVersion") && !raw("os")) specs.osVersion = raw("osVersion");
  return { specs, problems, osText };
}

/**
 * The hardware columns of an inventory export, named as the template names them (HARDWARE_HEADERS),
 * so an export, filled in, loads back. `label` gives a list value's name.
 */
export function hardwareColumns(
  label: (
    list: "cpu_intel" | "cpu_amd" | "cpu_apple" | "operating_system",
    code: string,
  ) => string,
) {
  const s = (a: { specs?: unknown }) => assetSpecs.parse(a.specs ?? {});
  const drive = (a: { specs?: unknown }, i: number) => s(a).drives[i];
  return [
    {
      header: "Processor brand",
      value: (a: { specs?: unknown }) =>
        s(a).cpuBrand ? CPU_BRAND_LABELS[s(a).cpuBrand as CpuBrand] : "",
    },
    {
      header: "Processor family",
      value: (a: { specs?: unknown }) => {
        const x = s(a);
        return x.cpuBrand && x.cpuFamily
          ? label(CPU_LIST[x.cpuBrand], x.cpuFamily)
          : "";
      },
    },
    {
      header: "Processor model",
      value: (a: { specs?: unknown }) => s(a).cpuModel,
    },
    { header: "vCPUs", value: (a: { specs?: unknown }) => s(a).vcpus },
    { header: "RAM (GB)", value: (a: { specs?: unknown }) => s(a).ramGb },
    {
      header: "Storage size",
      value: (a: { specs?: unknown }) =>
        drive(a, 0) ? driveSize(drive(a, 0)) : "",
    },
    {
      header: "Storage type",
      value: (a: { specs?: unknown }) =>
        drive(a, 0)?.type
          ? STORAGE_LABELS[drive(a, 0).type as keyof typeof STORAGE_LABELS]
          : "",
    },
    {
      header: "Storage 2 size",
      value: (a: { specs?: unknown }) =>
        drive(a, 1) ? driveSize(drive(a, 1)) : "",
    },
    {
      header: "Storage 2 type",
      value: (a: { specs?: unknown }) =>
        drive(a, 1)?.type
          ? STORAGE_LABELS[drive(a, 1).type as keyof typeof STORAGE_LABELS]
          : "",
    },
    {
      header: "Ports",
      value: (a: { specs?: unknown }) =>
        s(a)
          .ports.map((p) => PORT_LABELS[p])
          .join(", "),
    },
    {
      header: "Operating system",
      value: (a: { specs?: unknown; os?: string | null }) =>
        s(a).os ? label("operating_system", s(a).os) : (a.os ?? ""),
    },
    { header: "OS version", value: (a: { specs?: unknown }) => s(a).osVersion },
    {
      header: "Screen (inches)",
      value: (a: { specs?: unknown }) => s(a).screenInches,
    },
    { header: "Port count", value: (a: { specs?: unknown }) => s(a).portCount },
  ];
}
