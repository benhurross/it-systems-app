import { describe, expect, it } from "vitest";
import {
  assetInput,
  changeDecision,
  contractInput,
  lookupInput,
  relationshipInput,
  slaSettings,
  ticketCreate,
  ticketUpdate,
  vendorInput,
} from "@/lib/schemas";

describe("input schemas", () => {
  it("defaults a new ticket to medium priority and nulls the optional links", () => {
    const parsed = ticketCreate.parse({ type: "request", subject: " Help ", description: "d", issueType: "email", location: "jeddah" });
    expect(parsed).toMatchObject({ subject: "Help", priority: "medium", requesterId: null, assigneeId: null, assetId: null });
  });

  it("needs a resolution note to resolve a ticket", () => {
    expect(ticketUpdate.safeParse({ status: "resolved" }).success).toBe(false);
    expect(ticketUpdate.safeParse({ status: "resolved", resolution: "Fixed" }).success).toBe(true);
    expect(ticketUpdate.safeParse({ satisfaction: 6 }).success).toBe(false);
  });

  it("needs a result to record a change as implemented", () => {
    expect(changeDecision.safeParse({ status: "implemented" }).success).toBe(false);
    expect(changeDecision.safeParse({ status: "implemented", result: "rolled_back" }).success).toBe(true);
  });

  it("rejects a contract that ends before it starts", () => {
    const base = { title: "T", vendorId: null, category: "services", startDate: "2026-05-01", endDate: "2026-04-30", annualCost: 1, autoRenew: false };
    expect(contractInput.safeParse(base).success).toBe(false);
    expect(contractInput.safeParse({ ...base, endDate: "2026-05-01" }).success).toBe(true);
  });

  it("stops an item relating to itself", () => {
    expect(relationshipInput.safeParse({ sourceId: 3, targetId: 3, type: "depends_on" }).success).toBe(false);
  });

  it("checks addresses and turns empty optional text into null", () => {
    const base = {
      name: "X", category: "network", type: "switch", status: "in_use", location: "jeddah",
      supportStatus: "supported", criticality: "high", monitorMethod: "ping",
    };
    expect(assetInput.safeParse({ ...base, ipAddress: "10.0.0.300" }).success).toBe(false);
    const parsed = assetInput.parse({ ...base, ipAddress: "10.0.0.3", notes: "", model: "  " });
    expect(parsed).toMatchObject({ ipAddress: "10.0.0.3", notes: null, model: null, monitorPort: null });
  });

  it("needs an address to monitor a device, and a port to check it over TCP", () => {
    const base = {
      name: "X", category: "network", type: "switch", status: "in_use", location: "jeddah",
      supportStatus: "supported", criticality: "high",
    };
    expect(assetInput.safeParse({ ...base, monitorMethod: "none" }).success).toBe(true);
    const noAddress = assetInput.safeParse({ ...base, monitorMethod: "ping" });
    expect(noAddress.error?.issues).toEqual([expect.objectContaining({ path: ["ipAddress"], message: "validation.ipRequired" })]);
    const noPort = assetInput.safeParse({ ...base, monitorMethod: "tcp", ipAddress: "10.0.0.3" });
    expect(noPort.error?.issues).toEqual([expect.objectContaining({ path: ["monitorPort"], message: "validation.portRequired" })]);
    expect(assetInput.safeParse({ ...base, monitorMethod: "tcp", ipAddress: "10.0.0.3", monitorPort: 443 }).success).toBe(true);
  });

  it("checks vendor contact details", () => {
    const base = { name: "V", category: "services", active: true };
    expect(vendorInput.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
    expect(vendorInput.safeParse({ ...base, website: "vendor.test" }).success).toBe(false);
    expect(vendorInput.parse({ ...base, email: "a@b.test" }).website).toBeNull();
  });

  it("keeps list codes simple", () => {
    const base = { list: "location", labelEn: "Dammam", labelAr: "الدمام", sortOrder: 1, active: true };
    expect(lookupInput.safeParse({ ...base, code: "Dammam Office" }).success).toBe(false);
    expect(lookupInput.safeParse({ ...base, code: "dammam_office" }).success).toBe(true);
  });
});

describe("SLA settings", () => {
  it("keeps issue types with a target and drops the empty ones", () => {
    const parsed = slaSettings.parse({ critical: 4, high: 8, medium: 24, low: 72, byIssueType: { login: 0.5, other: 120, email: null } });
    expect(parsed.byIssueType).toEqual({ login: 0.5, other: 120 });
  });

  it("reads settings saved before issue types had targets", () => {
    expect(slaSettings.parse({ critical: 4, high: 8, medium: 24, low: 72 }).byIssueType).toEqual({});
  });
});
