import { z } from "zod";

/**
 * An asset's hardware: processor, memory, drives, operating system, screen. Which of these an asset
 * has depends on what it is: a laptop has all of them, a virtual server virtual CPUs, a monitor a
 * screen, a switch a number of ports, software none. The processor, the storage types and the
 * operating systems are lists (Settings → Lists), which IT also adds to from the asset form.
 */

export const STORAGE_UNITS = ["GB", "TB"] as const;

/** The lists the asset form's hardware dropdowns offer, which IT may add a value to from the form. */
export const HARDWARE_LISTS = ["processor", "storage_type", "operating_system"] as const;

export type SpecField = "cpu" | "vcpus" | "ram" | "storage" | "os" | "screen" | "portCount";
type Profile = { fields: SpecField[]; drives: number };

export const PROFILES = {
  laptop: { fields: ["cpu", "ram", "storage", "os", "screen"], drives: 2 },
  desktop: { fields: ["cpu", "ram", "storage", "os"], drives: 2 },
  server: { fields: ["cpu", "ram", "storage", "os"], drives: 2 },
  virtual: { fields: ["vcpus", "ram", "storage", "os"], drives: 2 },
  monitor: { fields: ["screen"], drives: 0 },
  peripheral: { fields: [], drives: 0 },
  network: { fields: ["portCount", "os"], drives: 0 },
  storage: { fields: ["storage", "os"], drives: 2 },
  none: { fields: [], drives: 0 },
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
const blank = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v ?? "");
const size = z.number().positive().max(1_000_000).nullish().transform((v) => v ?? null);
/** A drive: its size, and its type, a code in the storage types list. */
const drive = z.object({ size, unit: z.enum(STORAGE_UNITS).nullish().transform((v) => v ?? "GB"), type: blank(60) });

export const assetSpecs = z
  .object({
    /** A code in the processor list ("intel_core_i5"). */
    cpu: blank(60),
    vcpus: z.number().int().positive().max(1024).nullish().transform((v) => v ?? null),
    ramGb: z.number().positive().max(65_536).nullish().transform((v) => v ?? null),
    drives: z.array(drive).max(2).default([]),
    /** A code in the operating systems list. */
    os: blank(60),
    screenInches: z.number().positive().max(200).nullish().transform((v) => v ?? null),
    portCount: z.number().int().positive().max(1000).nullish().transform((v) => v ?? null),
  })
  .default({ cpu: "", vcpus: null, ramGb: null, drives: [], os: "", screenInches: null, portCount: null });
export type AssetSpecs = z.output<typeof assetSpecs>;

/** The specs kept for what an asset is: fields its type does not have are dropped, as are empty drives. */
export function pruneSpecs(specs: AssetSpecs, type: string, category?: string | null): AssetSpecs {
  const p = profileOf(type, category);
  const has = (f: SpecField) => p.fields.includes(f);
  return {
    cpu: has("cpu") ? specs.cpu : "",
    vcpus: has("vcpus") ? specs.vcpus : null,
    ramGb: has("ram") ? specs.ramGb : null,
    drives: has("storage") ? specs.drives.slice(0, p.drives).filter((d) => d.size || d.type) : [],
    os: has("os") ? specs.os : "",
    screenInches: has("screen") ? specs.screenInches : null,
    portCount: has("portCount") ? specs.portCount : null,
  };
}

/** "512 GB" or "1 TB". */
export const driveSize = (d: { size: number | null; unit: "GB" | "TB" }) => (d.size ? `${d.size} ${d.unit}` : "");

/** A code for a value added to a list from its name: "Intel Xeon" → "intel_xeon". */
export const codeOf = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50) || "value";
