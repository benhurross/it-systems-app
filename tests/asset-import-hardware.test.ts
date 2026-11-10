import { describe, expect, it } from "vitest";
import { type ImportContext, planImport, TEMPLATE_HEADERS } from "@/lib/asset-import";
import { findInList, listCode, readSize, type NewListValue } from "@/lib/asset-sheet-specs";
import { assetInput } from "@/lib/schemas";

const lookups = [
  { list: "asset_type", code: "laptop", labelEn: "Laptop", labelAr: "حاسب محمول" },
  { list: "asset_type", code: "monitor", labelEn: "Monitor", labelAr: "شاشة" },
  { list: "asset_category", code: "end_user", labelEn: "End-User Devices", labelAr: "أجهزة المستخدمين" },
  { list: "location", code: "jeddah", labelEn: "Jeddah Head Office", labelAr: "جدة - المكتب الرئيسي" },
  { list: "processor", code: "intel_core_i7", labelEn: "Intel Core i7", labelAr: "Intel Core i7" },
  { list: "processor", code: "intel_core_ultra_7", labelEn: "Intel Core Ultra 7", labelAr: "Intel Core Ultra 7" },
  { list: "processor", code: "amd_ryzen_5", labelEn: "AMD Ryzen 5", labelAr: "AMD Ryzen 5" },
  { list: "processor", code: "apple_m2", labelEn: "Apple M2", labelAr: "Apple M2" },
  { list: "storage_type", code: "ssd_nvme", labelEn: "SSD (NVMe)", labelAr: "SSD (NVMe)" },
  { list: "storage_type", code: "ssd_sata", labelEn: "SSD (SATA)", labelAr: "SSD (SATA)" },
  { list: "storage_type", code: "hdd", labelEn: "HDD", labelAr: "HDD" },
  { list: "operating_system", code: "win11_pro", labelEn: "Windows 11 Pro", labelAr: "Windows 11 Pro" },
  { list: "operating_system", code: "macos", labelEn: "macOS", labelAr: "macOS" },
];
const ctx: ImportContext = {
  lookups,
  employees: [],
  assets: [{ id: 7, ...assetInput.parse({ name: "LT-007", category: "end_user", type: "laptop", status: "in_use", location: "jeddah", supportStatus: "supported", criticality: "low", monitorMethod: "none", specs: { ramGb: 8 } }) }],
};
const code = (list: "processor" | "storage_type" | "operating_system", value: string) => findInList(list, value, lookups)?.code ?? null;

describe("reading hardware from a sheet", () => {
  it("reads sizes, and matches processors, storage types and systems as people write them", () => {
    expect(readSize("512")).toEqual({ size: 512, unit: "GB" });
    expect(readSize("1TB")).toEqual({ size: 1, unit: "TB" });
    expect(readSize("1,5 tb")).toEqual({ size: 1.5, unit: "TB" });
    expect(readSize("lots")).toBeNull();
    expect(["SSD (NVMe)", "nvme ssd", "SSD", "hdd", "tape"].map((v) => code("storage_type", v))).toEqual(["ssd_nvme", "ssd_nvme", "ssd_sata", "hdd", null]);
    expect(code("processor", "Intel Core Ultra 7 155H")).toBe("intel_core_ultra_7");
    expect(code("processor", "AMD Ryzen 5 5600U")).toBe("amd_ryzen_5");
    expect(code("processor", "Ryzen 5")).toBe("amd_ryzen_5");
    expect(code("processor", "Cyrix 6x86")).toBeNull();
    expect(code("operating_system", "Windows 11 Pro 23H2")).toBe("win11_pro");
    expect(code("operating_system", "Windows XP")).toBeNull();
  });

  it("gives a value a list lacks a new code, once for the whole sheet", () => {
    const added: NewListValue[] = [];
    expect(listCode("processor", "Intel Xeon Silver", lookups, added)).toBe("intel_xeon_silver");
    expect(listCode("processor", "intel xeon silver", lookups, added)).toBe("intel_xeon_silver");
    // A code already taken by another name gets a number.
    expect(listCode("storage_type", "HDD!", [...lookups, { list: "storage_type", code: "hdd_2", labelEn: "x", labelAr: "x" }], [])).toBe("hdd");
    expect(added).toEqual([{ list: "processor", code: "intel_xeon_silver", label: "Intel Xeon Silver" }]);
  });

  it("adds an asset with its hardware from the template's columns", () => {
    const header = [...TEMPLATE_HEADERS];
    expect(header).not.toContain("Ports");
    const row = Object.fromEntries(header.map((h) => [h, ""])) as Record<string, string>;
    Object.assign(row, {
      "Asset Name / Workstation Name": "FIN-PC-07", Type: "Laptop", Location: "Jeddah Head Office",
      Processor: "Intel Core i7", "RAM (GB)": "16",
      "Storage size": "512 GB", "Storage type": "SSD (NVMe)", "Storage 2 size": "1 TB", "Storage 2 type": "HDD",
      "Operating system": "Windows 11 Pro", "Screen (inches)": "15.6",
    });
    const { rows, unused, added } = planImport([header, header.map((h) => row[h])], ctx);
    expect(unused).toEqual([]);
    expect(added).toEqual([]);
    expect(rows[0]).toMatchObject({ action: "add", problems: [] });
    expect(rows[0].input!.specs).toMatchObject({
      cpu: "intel_core_i7", ramGb: 16, screenInches: 15.6, os: "win11_pro",
      drives: [{ size: 512, unit: "GB", type: "ssd_nvme" }, { size: 1, unit: "TB", type: "hdd" }],
    });
  });

  it("updates an asset's hardware, keeping what the sheet leaves out; new values join their lists", () => {
    const { rows, added } = planImport(
      [
        ["Tag", "Name", "Processor", "Storage size", "Storage type", "Operating system"],
        ["AST-0007", "LT-007", "AMD Ryzen 5 5600U", "256", "", "Rocky Linux 9"],
        ["", "NEW-01", "Cyrix 6x86", "huge", "Tape", ""],
      ],
      ctx,
    );
    expect(rows[0]).toMatchObject({ action: "update", changes: ["specs"] });
    expect(rows[0].input!.specs).toMatchObject({ cpu: "amd_ryzen_5", ramGb: 8, os: "rocky_linux_9", drives: [{ size: 256 }] });
    expect(rows[1].action).toBe("skip");
    expect(rows[1].problems).toEqual(expect.arrayContaining([{ code: "unknown", field: "drive1", value: "huge" }]));
    // Only what a row being loaded uses is added: not the skipped row's processor or storage type.
    expect(added).toEqual([{ list: "operating_system", code: "rocky_linux_9", label: "Rocky Linux 9" }]);
  });
});

describe("reading rooms from a sheet", () => {
  it("puts an asset in a room a floor plan names, on that plan, and keeps any other as written", () => {
    const withRooms = { ...ctx, rooms: [{ room: "Server Room", planId: 3 }, { room: "Store", planId: null }] };
    const { rows } = planImport(
      [
        ["Name", "Type", "Location", "Room / area", "Status"],
        ["SRV-01", "Laptop", "Jeddah Head Office", "server room", "In use"],
        ["MR-TV-01", "Monitor", "Jeddah Head Office", "Board  room", "In use"],
      ],
      withRooms,
    );
    expect(rows[0].input).toMatchObject({ room: "Server Room", planId: 3, status: "in_use", assignedTo: null });
    expect(rows[1].input).toMatchObject({ room: "Board room", planId: null, status: "in_use" });
  });
});
