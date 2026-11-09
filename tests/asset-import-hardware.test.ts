import { describe, expect, it } from "vitest";
import { type ImportContext, planImport, TEMPLATE_HEADERS } from "@/lib/asset-import";
import { readOs, readPorts, readProcessor, readSize, readStorageType } from "@/lib/asset-sheet-specs";
import { assetInput } from "@/lib/schemas";

const lookups = [
  { list: "asset_type", code: "laptop", labelEn: "Laptop", labelAr: "حاسب محمول" },
  { list: "asset_type", code: "monitor", labelEn: "Monitor", labelAr: "شاشة" },
  { list: "asset_category", code: "end_user", labelEn: "End-User Devices", labelAr: "أجهزة المستخدمين" },
  { list: "location", code: "jeddah", labelEn: "Jeddah Head Office", labelAr: "جدة - المكتب الرئيسي" },
  { list: "cpu_intel", code: "core_i7", labelEn: "Core i7", labelAr: "Core i7" },
  { list: "cpu_intel", code: "core_ultra_7", labelEn: "Core Ultra 7", labelAr: "Core Ultra 7" },
  { list: "cpu_amd", code: "ryzen_5", labelEn: "Ryzen 5", labelAr: "Ryzen 5" },
  { list: "cpu_apple", code: "m2_pro", labelEn: "M2 Pro", labelAr: "M2 Pro" },
  { list: "cpu_apple", code: "m2", labelEn: "M2", labelAr: "M2" },
  { list: "operating_system", code: "win11_pro", labelEn: "Windows 11 Pro", labelAr: "Windows 11 Pro" },
  { list: "operating_system", code: "macos", labelEn: "macOS", labelAr: "macOS" },
];
const ctx: ImportContext = {
  lookups,
  employees: [],
  assets: [{ id: 7, ...assetInput.parse({ name: "LT-007", category: "end_user", type: "laptop", status: "in_use", location: "jeddah", supportStatus: "supported", criticality: "low", monitorMethod: "none", specs: { ramGb: 8 } }) }],
};

describe("reading hardware from a sheet", () => {
  it("reads sizes, storage types, ports, processors and systems as people write them", () => {
    expect(readSize("512")).toEqual({ size: 512, unit: "GB" });
    expect(readSize("1TB")).toEqual({ size: 1, unit: "TB" });
    expect(readSize("1,5 tb")).toEqual({ size: 1.5, unit: "TB" });
    expect(readSize("lots")).toBeNull();
    expect([readStorageType("SSD (NVMe)"), readStorageType("nvme ssd"), readStorageType("SSD"), readStorageType("HDD"), readStorageType("tape")]).toEqual(["ssd_nvme", "ssd_nvme", "ssd_sata", "hdd", null]);
    expect(readPorts("USB-C, hdmi; Network (RJ-45), RJ45, Parallel")).toEqual({ ports: ["usb_c", "hdmi", "ethernet"], unknown: ["Parallel"] });
    expect(readProcessor("Intel Core Ultra 7 155H", lookups)).toEqual({ brand: "intel", family: "core_ultra_7", model: "155H" });
    expect(readProcessor("Apple M2 Pro", lookups)).toEqual({ brand: "apple", family: "m2_pro", model: "" });
    expect(readProcessor("Ryzen 5 5600U", lookups)).toEqual({ brand: "amd", family: "ryzen_5", model: "5600U" });
    expect(readOs("Windows 11 Pro 23H2", lookups)).toEqual({ os: "win11_pro", version: "23H2" });
    expect(readOs("Windows XP", lookups)).toBeNull();
  });

  it("adds an asset with its hardware from the template's columns", () => {
    const header = [...TEMPLATE_HEADERS];
    const row = Object.fromEntries(header.map((h) => [h, ""])) as Record<string, string>;
    Object.assign(row, {
      "Asset Name / Workstation Name": "FIN-PC-07", Type: "Laptop", Location: "Jeddah Head Office",
      Processor: "Intel Core i7", "RAM (GB)": "16",
      "Storage size": "512 GB", "Storage type": "SSD (NVMe)", "Storage 2 size": "1 TB", "Storage 2 type": "HDD",
      Ports: "USB-C, HDMI, Wi-Fi", "Operating system": "Windows 11 Pro", "Screen (inches)": "15.6",
    });
    const { rows, unused } = planImport([header, header.map((h) => row[h])], ctx);
    expect(unused).toEqual([]);
    expect(rows[0]).toMatchObject({ action: "add", problems: [] });
    expect(rows[0].input!.specs).toMatchObject({
      cpuBrand: "intel", cpuFamily: "core_i7", ramGb: 16, screenInches: 15.6, os: "win11_pro", ports: ["usb_c", "hdmi", "wifi"],
      drives: [{ size: 512, unit: "GB", type: "ssd_nvme" }, { size: 1, unit: "TB", type: "hdd" }],
    });
  });

  it("updates an asset's hardware, keeping what the sheet leaves out, and says what it could not read", () => {
    const { rows } = planImport(
      [
        ["Tag", "Name", "Processor", "Storage size", "Ports"],
        ["AST-0007", "LT-007", "AMD Ryzen 5 5600U", "256", "USB-C"],
        ["", "NEW-01", "Cyrix 6x86", "huge", "Firewire"],
      ],
      ctx,
    );
    expect(rows[0]).toMatchObject({ action: "update", changes: ["specs"] });
    expect(rows[0].input!.specs).toMatchObject({ cpuBrand: "amd", cpuFamily: "ryzen_5", cpuModel: "5600U", ramGb: 8, drives: [{ size: 256 }], ports: ["usb_c"] });
    expect(rows[1].action).toBe("skip");
    expect(rows[1].problems).toEqual(expect.arrayContaining([
      { code: "unknown", field: "processor", value: "Cyrix 6x86" },
      { code: "unknown", field: "drive1", value: "huge" },
      { code: "unknown", field: "ports", value: "Firewire" },
    ]));
  });
});
