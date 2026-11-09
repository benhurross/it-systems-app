import { describe, expect, it } from "vitest";
import { assetSpecs, profileOf, pruneSpecs } from "@/lib/asset-specs";

const full = assetSpecs.parse({
  cpuBrand: "amd",
  cpuFamily: "ryzen_5",
  cpuModel: "5600G",
  vcpus: 4,
  ramGb: 16,
  drives: [{ size: 512, unit: "GB", type: "ssd_nvme" }, { size: 1, unit: "TB", type: "hdd" }],
  ports: ["usb_c", "hdmi", "ethernet", "sfp"],
  os: "win11_pro",
  osVersion: "23H2",
  screenInches: 14,
  portCount: 24,
});

describe("an asset's hardware", () => {
  it("shows what its type has", () => {
    expect(profileOf("laptop").fields).toEqual(["cpu", "ram", "storage", "ports", "os", "screen"]);
    expect(profileOf("virtual_server").fields).toEqual(["vcpus", "ram", "storage", "os"]);
    expect(profileOf("application").fields).toEqual([]);
    // A type added since goes by its category.
    expect(profileOf("thin_client", "end_user").fields).toContain("cpu");
    expect(profileOf("thin_client", "software").fields).toEqual([]);
  });

  it("keeps only what the type has", () => {
    const desktop = pruneSpecs(full, "desktop");
    expect(desktop).toMatchObject({ cpuBrand: "amd", cpuFamily: "ryzen_5", ramGb: 16, os: "win11_pro", vcpus: null, screenInches: null, portCount: null });
    // The processor's model and the system's version are no longer kept.
    expect(desktop).toMatchObject({ cpuModel: "", osVersion: "" });
    expect(desktop.drives).toHaveLength(2);
    // SFP is not a desktop port.
    expect(desktop.ports).toEqual(["usb_c", "hdmi", "ethernet"]);
    const monitor = pruneSpecs(full, "monitor");
    expect(monitor).toMatchObject({ cpuBrand: "", ramGb: null, os: "", screenInches: 14, drives: [] });
    expect(monitor.ports).toEqual(["usb_c", "hdmi"]);
    expect(pruneSpecs(full, "switch")).toMatchObject({ portCount: 24, ports: ["usb_c", "ethernet", "sfp"], cpuBrand: "" });
    expect(pruneSpecs(full, "cloud_service")).toEqual(assetSpecs.parse({}));
  });

  it("takes what the form sends for an empty choice, and drops empty drives", () => {
    const parsed = assetSpecs.parse({ cpuBrand: null, os: null, drives: [{ size: null, unit: null, type: null }] });
    expect(parsed).toMatchObject({ cpuBrand: "", os: "", drives: [{ size: null, unit: "GB", type: "" }] });
    expect(pruneSpecs(parsed, "laptop").drives).toEqual([]);
    expect(assetSpecs.safeParse({ cpuBrand: "via" }).success).toBe(false);
    expect(assetSpecs.safeParse({ ports: ["parallel"] }).success).toBe(false);
  });
});
