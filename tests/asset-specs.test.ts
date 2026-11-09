import { describe, expect, it } from "vitest";
import { assetSpecs, codeOf, profileOf, pruneSpecs } from "@/lib/asset-specs";

const full = assetSpecs.parse({
  cpu: "amd_ryzen_5",
  vcpus: 4,
  ramGb: 16,
  drives: [{ size: 512, unit: "GB", type: "ssd_nvme" }, { size: 1, unit: "TB", type: "hdd" }],
  os: "win11_pro",
  screenInches: 14,
  portCount: 24,
});

describe("an asset's hardware", () => {
  it("shows what its type has", () => {
    expect(profileOf("laptop").fields).toEqual(["cpu", "ram", "storage", "os", "screen"]);
    expect(profileOf("virtual_server").fields).toEqual(["vcpus", "ram", "storage", "os"]);
    expect(profileOf("application").fields).toEqual([]);
    // A type added since goes by its category.
    expect(profileOf("thin_client", "end_user").fields).toContain("cpu");
    expect(profileOf("thin_client", "software").fields).toEqual([]);
  });

  it("keeps only what the type has", () => {
    const desktop = pruneSpecs(full, "desktop");
    expect(desktop).toMatchObject({ cpu: "amd_ryzen_5", ramGb: 16, os: "win11_pro", vcpus: null, screenInches: null, portCount: null });
    expect(desktop.drives).toHaveLength(2);
    expect(pruneSpecs(full, "monitor")).toMatchObject({ cpu: "", ramGb: null, os: "", screenInches: 14, drives: [] });
    expect(pruneSpecs(full, "switch")).toMatchObject({ portCount: 24, os: "win11_pro", cpu: "" });
    expect(pruneSpecs(full, "cloud_service")).toEqual(assetSpecs.parse({}));
  });

  it("takes what the form sends for an empty choice, drops empty drives, and forgets what is no longer kept", () => {
    const parsed = assetSpecs.parse({ cpu: null, os: null, drives: [{ size: null, unit: null, type: null }] });
    expect(parsed).toMatchObject({ cpu: "", os: "", drives: [{ size: null, unit: "GB", type: "" }] });
    expect(pruneSpecs(parsed, "laptop").drives).toEqual([]);
    // Ports and the old processor fields, from before, are dropped.
    expect(assetSpecs.parse({ cpu: "intel_core_i5", ports: ["hdmi"], cpuBrand: "intel" })).not.toHaveProperty("ports");
  });

  it("makes a code for a value added from a form", () => {
    expect(codeOf("Intel Xeon Silver")).toBe("intel_xeon_silver");
    expect(codeOf("SSD (NVMe)")).toBe("ssd_nvme");
    expect(codeOf("ويندوز")).toBe("value");
  });
});
