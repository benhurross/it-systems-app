import { z } from "zod";

/**
 * An asset's hardware: processor, memory, drives, ports, operating system, screen. Which of these
 * an asset has depends on what it is: a laptop has all of them, a virtual server virtual CPUs and
 * no ports, a monitor a screen and its ports, a switch a number of ports, software none.
 */

export const CPU_BRANDS = ["intel", "amd", "apple"] as const;
export type CpuBrand = (typeof CPU_BRANDS)[number];
/** Each brand's processor families are a list admins keep (Settings → Lists). */
export const CPU_LIST = { intel: "cpu_intel", amd: "cpu_amd", apple: "cpu_apple" } as const;

export const STORAGE_TYPES = ["ssd_nvme", "ssd_sata", "hdd"] as const;
export const STORAGE_UNITS = ["GB", "TB"] as const;

export const PORTS = [
  "ethernet",
  "usb_a",
  "usb_c",
  "thunderbolt",
  "usb_b",
  "hdmi",
  "displayport",
  "mini_displayport",
  "vga",
  "dvi",
  "audio",
  "sd_card",
  "microsd",
  "serial",
  "docking",
  "kensington",
  "sim",
  "sfp",
  "console",
  "wifi",
  "bluetooth",
] as const;
export type Port = (typeof PORTS)[number];

export type SpecField = "cpu" | "vcpus" | "ram" | "storage" | "ports" | "os" | "screen" | "portCount";
type Profile = { fields: SpecField[]; ports: readonly Port[]; drives: number };

const COMPUTER_PORTS: Port[] = ["ethernet", "usb_a", "usb_c", "thunderbolt", "hdmi", "displayport", "mini_displayport", "vga", "dvi", "audio", "sd_card", "microsd", "serial", "docking", "kensington", "sim", "wifi", "bluetooth"];

export const PROFILES = {
  laptop: { fields: ["cpu", "ram", "storage", "ports", "os", "screen"], ports: COMPUTER_PORTS, drives: 2 },
  desktop: { fields: ["cpu", "ram", "storage", "ports", "os"], ports: COMPUTER_PORTS, drives: 2 },
  server: { fields: ["cpu", "ram", "storage", "ports", "os"], ports: ["ethernet", "sfp", "usb_a", "usb_c", "vga", "hdmi", "displayport", "serial", "console"], drives: 2 },
  virtual: { fields: ["vcpus", "ram", "storage", "os"], ports: [], drives: 2 },
  monitor: { fields: ["screen", "ports"], ports: ["hdmi", "displayport", "mini_displayport", "usb_c", "thunderbolt", "vga", "dvi", "usb_a", "usb_b", "audio"], drives: 0 },
  peripheral: { fields: ["ports"], ports: ["ethernet", "usb_b", "usb_a", "usb_c", "wifi", "bluetooth", "sd_card"], drives: 0 },
  network: { fields: ["portCount", "ports", "os"], ports: ["ethernet", "sfp", "console", "usb_a", "usb_c", "serial", "wifi"], drives: 0 },
  storage: { fields: ["storage", "ports", "os"], ports: ["ethernet", "sfp", "usb_a", "usb_c", "serial"], drives: 2 },
  none: { fields: [], ports: [], drives: 0 },
} satisfies Record<string, Profile>;
export type ProfileName = keyof typeof PROFILES;

const BY_TYPE: Record<string, ProfileName> = {
  laptop: "laptop",
  desktop: "desktop",
  physical_server: "server",
  virtual_server: "virtual",
  monitor: "monitor",
  printer: "peripheral",
  scanner: "peripheral",
  switch: "network",
  router: "network",
  firewall: "network",
  access_point: "network",
  storage: "storage",
  backup_appliance: "storage",
  nvr: "storage",
};
const BY_CATEGORY: Record<string, ProfileName> = { end_user: "desktop", servers: "server", network: "network", printers: "peripheral", backup: "storage" };

/** What an asset of a type (or, for a type added since, of a category) has. */
export function profileOf(type: string | null | undefined, category?: string | null): Profile {
  return PROFILES[(type && BY_TYPE[type]) || (category && BY_CATEGORY[category]) || "none"];
}

/** A choice or text that may be left empty: kept as "", however the form sends "nothing". */
const blank = <T extends z.ZodType<string>>(schema: T) =>
  z
    .union([schema, z.literal("")])
    .nullish()
    .transform((v) => (v ?? "") as z.output<T> | "");
const size = z.number().positive().max(1_000_000).nullish().transform((v) => v ?? null);
const drive = z.object({ size, unit: z.enum(STORAGE_UNITS).nullish().transform((v) => v ?? "GB"), type: blank(z.enum(STORAGE_TYPES)) });

export const assetSpecs = z
  .object({
    cpuBrand: blank(z.enum(CPU_BRANDS)),
    cpuFamily: blank(z.string().trim().max(60)),
    cpuModel: blank(z.string().trim().max(80)),
    vcpus: z.number().int().positive().max(1024).nullish().transform((v) => v ?? null),
    ramGb: z.number().positive().max(65_536).nullish().transform((v) => v ?? null),
    drives: z.array(drive).max(2).default([]),
    ports: z.array(z.enum(PORTS)).default([]),
    os: blank(z.string().trim().max(60)),
    osVersion: blank(z.string().trim().max(80)),
    screenInches: z.number().positive().max(200).nullish().transform((v) => v ?? null),
    portCount: z.number().int().positive().max(1000).nullish().transform((v) => v ?? null),
  })
  .default({ cpuBrand: "", cpuFamily: "", cpuModel: "", vcpus: null, ramGb: null, drives: [], ports: [], os: "", osVersion: "", screenInches: null, portCount: null });
export type AssetSpecs = z.output<typeof assetSpecs>;

/** The specs kept for what an asset is: fields its type does not have are dropped, as are empty drives. */
export function pruneSpecs(specs: AssetSpecs, type: string, category?: string | null): AssetSpecs {
  const p = profileOf(type, category);
  const has = (f: SpecField) => p.fields.includes(f);
  const cpu = has("cpu");
  return {
    cpuBrand: cpu ? specs.cpuBrand : "",
    cpuFamily: cpu && specs.cpuBrand ? specs.cpuFamily : "",
    // The model (1255U) and the system's version (23H2) are no longer recorded.
    cpuModel: "",
    vcpus: has("vcpus") ? specs.vcpus : null,
    ramGb: has("ram") ? specs.ramGb : null,
    drives: has("storage") ? specs.drives.slice(0, p.drives).filter((d) => d.size || d.type) : [],
    ports: has("ports") ? specs.ports.filter((x) => p.ports.includes(x)) : [],
    os: has("os") ? specs.os : "",
    osVersion: "",
    screenInches: has("screen") ? specs.screenInches : null,
    portCount: has("portCount") ? specs.portCount : null,
  };
}

/** "512 GB" or "1 TB". */
export const driveSize = (d: { size: number | null; unit: "GB" | "TB" }) => (d.size ? `${d.size} ${d.unit}` : "");

/** The English names a sheet uses for ports and drives (the template's Lists, and reading them back). */
export const PORT_LABELS: Record<Port, string> = {
  ethernet: "Network (RJ-45)",
  usb_a: "USB-A",
  usb_c: "USB-C",
  thunderbolt: "Thunderbolt",
  usb_b: "USB-B",
  hdmi: "HDMI",
  displayport: "DisplayPort",
  mini_displayport: "Mini DisplayPort",
  vga: "VGA",
  dvi: "DVI",
  audio: "Audio jack (3.5 mm)",
  sd_card: "SD card reader",
  microsd: "microSD reader",
  serial: "Serial (COM)",
  docking: "Docking connector",
  kensington: "Kensington lock",
  sim: "SIM card slot",
  sfp: "SFP / fibre",
  console: "Console port",
  wifi: "Wi-Fi",
  bluetooth: "Bluetooth",
};
export const STORAGE_LABELS: Record<(typeof STORAGE_TYPES)[number], string> = { ssd_nvme: "SSD (NVMe)", ssd_sata: "SSD (SATA)", hdd: "HDD" };
export const CPU_BRAND_LABELS: Record<CpuBrand, string> = { intel: "Intel", amd: "AMD", apple: "Apple" };

/**
 * Every processor as one list, "Intel Core i5", "AMD Ryzen 5", "Apple M2", from each brand's list
 * (Settings → Lists); the value is the brand and the family, "intel:core_i5".
 */
export function processorOptions(lookups: { options: (list: (typeof CPU_LIST)[CpuBrand]) => { value: string; label: string }[] }) {
  return CPU_BRANDS.flatMap((b) => lookups.options(CPU_LIST[b]).map((o) => ({ value: `${b}:${o.value}`, label: `${CPU_BRAND_LABELS[b]} ${o.label}` })));
}
