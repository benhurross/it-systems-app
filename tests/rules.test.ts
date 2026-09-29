import { describe, expect, it } from "vitest";
import { impactOf, neighbours, type Relation } from "@/lib/cmdb";
import { addDays, daysBetween, hoursBetween, isoDate } from "@/lib/dates";
import { expandCidr, parseArp, reconcile } from "@/lib/discovery";
import { ref } from "@/lib/domain";
import { budgetLines, contractState, fiscalYearOf, fiscalYearRange } from "@/lib/finance";
import { quarterOf, rag, DEFAULT_KPI_TARGETS } from "@/lib/kpis";
import { compliance, licenseState } from "@/lib/licenses";
import { assetFlags } from "@/lib/lifecycle";
import { availability, nextState, parsePing } from "@/lib/monitor";
import { isProjectOverdue, projectProgress } from "@/lib/projects";
import { forwardingDaysLeft, forwardingEnds, leaverState, onboardingComplete, onboardingProgress } from "@/lib/people";
import { isOverdue, riskLevel, riskScore } from "@/lib/risk";
import {
  averageResolutionHours,
  averageSatisfaction,
  complaints,
  DEFAULT_SLA,
  dueAt,
  isBreached,
  resolutionHours,
  slaCompliance,
} from "@/lib/sla";
import { isReopen, nextChangeStatuses, nextPurchaseStatuses, nextStatuses } from "@/lib/workflows";

describe("dates", () => {
  it("gives the Riyadh calendar date, which runs three hours ahead of UTC", () => {
    expect(isoDate("2026-09-29T20:59:00Z")).toBe("2026-09-29");
    expect(isoDate("2026-09-29T21:00:00Z")).toBe("2026-09-30");
  });

  it("adds and counts days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(daysBetween("2026-03-01", "2026-02-27")).toBe(-2);
    expect(hoursBetween("2026-01-01T00:00:00Z", "2026-01-01T06:30:00Z")).toBe(6.5);
  });
});

describe("references", () => {
  it("follows the workbook's numbering", () => {
    expect(ref("ticket", 351)).toBe("IT000351");
    expect(ref("asset", 42)).toBe("AST-0042");
    expect(ref("license", 7)).toBe("LIC-007");
    expect(ref("vulnerability", 12)).toBe("VULN-012");
  });
});

describe("SLA", () => {
  const opened = new Date("2026-09-01T08:00:00Z");
  const ticket = (priority: keyof typeof DEFAULT_SLA, resolvedAfterHours: number | null) => ({
    status: resolvedAfterHours === null ? ("open" as const) : ("resolved" as const),
    createdAt: opened,
    dueAt: dueAt(opened, priority, DEFAULT_SLA),
    resolvedAt: resolvedAfterHours === null ? null : new Date(opened.getTime() + resolvedAfterHours * 3_600_000),
    satisfaction: null,
  });

  it("sets the due time from the priority's target", () => {
    expect(dueAt(opened, "critical", DEFAULT_SLA).toISOString()).toBe("2026-09-01T12:00:00.000Z");
    expect(dueAt(opened, "low", { ...DEFAULT_SLA, low: 1 }).toISOString()).toBe("2026-09-01T09:00:00.000Z");
  });

  it("counts a ticket breached when resolved late or still open past its due time", () => {
    expect(isBreached(ticket("high", 7))).toBe(false);
    expect(isBreached(ticket("high", 9))).toBe(true);
    expect(isBreached(ticket("high", null), new Date("2026-09-01T15:00:00Z"))).toBe(false);
    expect(isBreached(ticket("high", null), new Date("2026-09-01T17:00:00Z"))).toBe(true);
  });

  it("measures compliance, resolution time and complaints the way the KPI sheet does", () => {
    const tickets = [ticket("high", 2), ticket("high", 4), ticket("high", 10), ticket("critical", 3), ticket("low", null)];
    expect(slaCompliance(tickets)).toBe(0.75);
    expect(averageResolutionHours(tickets)).toBe(4.75);
    expect(resolutionHours(ticket("low", null))).toBeNull();
    expect(complaints(tickets, new Date("2026-09-10T00:00:00Z"))).toBe(2);
    expect(slaCompliance([ticket("low", null)])).toBeNull();
  });

  it("averages satisfaction over rated tickets only", () => {
    expect(averageSatisfaction([{ satisfaction: 5 }, { satisfaction: 4 }, { satisfaction: null }])).toBe(4.5);
    expect(averageSatisfaction([{ satisfaction: null }])).toBeNull();
  });
});

describe("ticket flow", () => {
  it("lets IT work the whole flow", () => {
    expect(nextStatuses("it_staff", "open")).toEqual(["in_progress", "on_hold", "resolved"]);
    expect(nextStatuses("admin", "closed")).toEqual(["open"]);
  });

  it("lets the requester only confirm or reopen a resolved ticket", () => {
    expect(nextStatuses("employee", "resolved")).toEqual(["closed", "open"]);
    expect(nextStatuses("employee", "open")).toEqual([]);
    expect(nextStatuses("employee", "closed")).toEqual([]);
  });

  it("recognises a reopen", () => {
    expect(isReopen("resolved", "open")).toBe(true);
    expect(isReopen("closed", "open")).toBe(true);
    expect(isReopen("in_progress", "open")).toBe(false);
  });

  it("takes changes through approval once, and purchases from request to receipt", () => {
    expect(nextChangeStatuses("requested")).toEqual(["approved", "rejected"]);
    expect(nextChangeStatuses("implemented")).toEqual([]);
    expect(nextPurchaseStatuses("approved")).toEqual(["ordered", "rejected"]);
    expect(nextPurchaseStatuses("ordered")).toEqual(["received"]);
    expect(nextPurchaseStatuses("received")).toEqual([]);
  });
});

describe("licences", () => {
  const today = "2026-09-29";
  it("puts over-deployment ahead of expiry", () => {
    expect(licenseState({ seats: 10, expiryDate: "2020-01-01" }, 11, today)).toBe("over_deployed");
  });

  it("warns sixty days ahead and marks the day after expiry", () => {
    expect(licenseState({ seats: 10, expiryDate: "2026-09-28" }, 5, today)).toBe("expired");
    expect(licenseState({ seats: 10, expiryDate: "2026-09-29" }, 5, today)).toBe("expiring");
    expect(licenseState({ seats: 10, expiryDate: "2026-11-28" }, 5, today)).toBe("expiring");
    expect(licenseState({ seats: 10, expiryDate: "2026-11-29" }, 5, today)).toBe("compliant");
    expect(licenseState({ seats: 10, expiryDate: null }, 10, today)).toBe("compliant");
  });

  it("counts expiring licences as compliant, the others not", () => {
    expect(compliance(["compliant", "expiring", "expired", "over_deployed"])).toBe(0.5);
    expect(compliance([])).toBeNull();
  });
});

describe("finance", () => {
  it("names a fiscal year by the year it starts", () => {
    expect(fiscalYearOf("2026-03-31", 4)).toBe(2025);
    expect(fiscalYearOf("2026-04-01", 4)).toBe(2026);
    expect(fiscalYearOf("2026-12-31", 1)).toBe(2026);
    expect(fiscalYearRange(2026, 1)).toEqual(["2026-01-01", "2026-12-31"]);
    expect(fiscalYearRange(2026, 4)).toEqual(["2026-04-01", "2027-03-31"]);
  });

  it("marks contracts expiring ninety days out", () => {
    expect(contractState({ endDate: "2026-09-28" }, "2026-09-29")).toBe("expired");
    expect(contractState({ endDate: "2026-12-28" }, "2026-09-29")).toBe("expiring");
    expect(contractState({ endDate: "2026-12-29" }, "2026-09-29")).toBe("active");
  });

  it("commits prorated contracts and approved purchases against each budget", () => {
    const lines = budgetLines(
      {
        budgets: [
          { category: "connectivity", amount: 30000 },
          { category: "hardware", amount: 10000 },
        ],
        contracts: [
          // Runs the whole year.
          { category: "connectivity", startDate: "2025-06-01", endDate: "2027-05-31", annualCost: 24000 },
          // Only the last quarter of the year: 92 of 365 days.
          { category: "connectivity", startDate: "2026-10-01", endDate: "2027-09-30", annualCost: 3650 },
        ],
        purchases: [
          { category: "hardware", status: "approved", amount: 6000, date: "2026-02-10" },
          { category: "hardware", status: "received", amount: 5000, date: "2026-07-01" },
          { category: "hardware", status: "rejected", amount: 9000, date: "2026-07-01" },
          { category: "hardware", status: "requested", amount: 9000, date: "2026-07-01" },
          { category: "hardware", status: "approved", amount: 9000, date: "2025-12-31" },
        ],
      },
      2026,
      1,
    );
    const connectivity = lines.find((l) => l.category === "connectivity")!;
    expect(connectivity.committed).toBe(24920);
    expect(connectivity.over).toBe(false);
    const hardware = lines.find((l) => l.category === "hardware")!;
    expect(hardware).toMatchObject({ purchases: 11000, committed: 11000, over: true });
    expect(hardware.utilisation).toBeCloseTo(1.1);
  });

  it("reports categories with spend but no budget", () => {
    const [line] = budgetLines(
      { budgets: [], contracts: [], purchases: [{ category: "cloud", status: "ordered", amount: 100, date: "2026-05-05" }] },
      2026,
      1,
    );
    expect(line).toMatchObject({ category: "cloud", budget: 0, utilisation: null, over: true });
  });
});

describe("CMDB impact", () => {
  // ERP app runs on the ERP server, which depends on the core switch; an access point connects to it;
  // the backup server backs up the ERP server; a laptop depends on the access point.
  const relations: Relation[] = [
    { sourceId: 1, targetId: 2, type: "runs_on" },
    { sourceId: 2, targetId: 3, type: "depends_on" },
    { sourceId: 4, targetId: 3, type: "connects_to" },
    { sourceId: 5, targetId: 2, type: "backs_up" },
    { sourceId: 6, targetId: 4, type: "depends_on" },
  ];

  it("follows failures upward through every dependent", () => {
    expect(impactOf(3, relations).sort()).toEqual([1, 2, 4, 6]);
    expect(impactOf(2, relations)).toEqual([1]);
    expect(impactOf(1, relations)).toEqual([]);
  });

  it("does not treat losing the backup server as an outage", () => {
    expect(impactOf(5, relations)).toEqual([]);
  });

  it("survives cycles", () => {
    const cycle: Relation[] = [
      { sourceId: 1, targetId: 2, type: "depends_on" },
      { sourceId: 2, targetId: 1, type: "depends_on" },
    ];
    expect(impactOf(1, cycle)).toEqual([2]);
  });

  it("splits direct relations by direction", () => {
    const n = neighbours(2, relations);
    expect(n.reliesOn.map((r) => r.targetId)).toEqual([3]);
    expect(n.reliedOnBy.map((r) => r.sourceId)).toEqual([1, 5]);
  });
});

describe("asset lifecycle", () => {
  const today = "2026-09-29";
  const base = {
    category: "end_user",
    status: "in_use" as const,
    purchaseDate: "2024-01-01",
    warrantyEnd: "2027-01-01",
    supportStatus: "supported" as const,
  };

  it("flags a warranty ending within ninety days", () => {
    expect(assetFlags({ ...base, warrantyEnd: "2026-12-28" }, today).warrantyExpiring).toBe(true);
    expect(assetFlags({ ...base, warrantyEnd: "2026-12-29" }, today).warrantyExpiring).toBe(false);
    expect(assetFlags({ ...base, warrantyEnd: "2026-09-28" }, today)).toMatchObject({
      warrantyExpiring: false,
      warrantyExpired: true,
    });
  });

  it("flags unsupported systems and end-user devices past four years", () => {
    expect(assetFlags({ ...base, supportStatus: "end_of_life" }, today).unsupported).toBe(true);
    expect(assetFlags({ ...base, purchaseDate: "2022-09-01" }, today).replacementDue).toBe(true);
    expect(assetFlags({ ...base, purchaseDate: "2022-09-01", category: "servers" }, today).replacementDue).toBe(false);
  });

  it("does not flag retired assets", () => {
    const flags = assetFlags({ ...base, status: "retired", supportStatus: "end_of_life", warrantyEnd: "2020-01-01" }, today);
    expect(Object.values(flags).some(Boolean)).toBe(false);
  });
});

describe("monitoring", () => {
  const up = { up: true, latencyMs: 12 };
  const down = { up: false, latencyMs: null };

  it("calls a device down only after two failed checks", () => {
    const first = nextState({ status: "up", failures: 0 }, down, 300);
    expect(first).toEqual({ status: "up", failures: 1, open: null, resolve: false });
    const second = nextState(first, down, 300);
    expect(second).toEqual({ status: "down", failures: 2, open: "down", resolve: false });
    expect(nextState(second, down, 300).open).toBeNull();
  });

  it("resolves the alert when the device recovers", () => {
    expect(nextState({ status: "down", failures: 3 }, up, 300)).toEqual({
      status: "up",
      failures: 0,
      open: null,
      resolve: true,
    });
  });

  it("opens a degraded alert on slow replies and swaps it for a down alert", () => {
    const slow = nextState({ status: "up", failures: 0 }, { up: true, latencyMs: 450 }, 300);
    expect(slow).toMatchObject({ status: "degraded", open: "degraded", resolve: false });
    const worse = nextState(nextState(slow, down, 300), down, 300);
    expect(worse).toMatchObject({ status: "down", open: "down", resolve: true });
  });

  it("raises nothing on a first successful check", () => {
    expect(nextState({ status: "unknown", failures: 0 }, up, 300)).toMatchObject({ status: "up", open: null, resolve: false });
  });

  it("measures availability", () => {
    expect(availability([{ up: true }, { up: true }, { up: false }, { up: true }])).toBe(0.75);
    expect(availability([])).toBeNull();
  });

  it("reads ping output from Windows and Linux", () => {
    expect(parsePing("Reply from 10.0.0.1: bytes=32 time=14ms TTL=64")).toEqual({ up: true, latencyMs: 14 });
    expect(parsePing("Reply from 10.0.0.1: bytes=32 time<1ms TTL=128")).toEqual({ up: true, latencyMs: 1 });
    expect(parsePing("64 bytes from 10.0.0.1: icmp_seq=1 ttl=63 time=3.42 ms")).toEqual({ up: true, latencyMs: 3 });
    expect(parsePing("Reply from 10.0.0.254: Destination host unreachable.")).toEqual({ up: false, latencyMs: null });
    expect(parsePing("Request timed out.")).toEqual({ up: false, latencyMs: null });
  });
});

describe("discovery", () => {
  it("expands a /24 into its 254 hosts", () => {
    const hosts = expandCidr("192.168.10.0/24");
    expect(hosts).toHaveLength(254);
    expect(hosts[0]).toBe("192.168.10.1");
    expect(hosts.at(-1)).toBe("192.168.10.254");
  });

  it("aligns the base address and handles the smallest blocks", () => {
    expect(expandCidr("10.1.2.77/30")).toEqual(["10.1.2.77", "10.1.2.78"]);
    expect(expandCidr("127.0.0.1/32")).toEqual(["127.0.0.1"]);
    expect(expandCidr("10.0.0.4/31")).toEqual(["10.0.0.4", "10.0.0.5"]);
  });

  it("refuses ranges it should not sweep", () => {
    expect(() => expandCidr("10.0.0.0/16")).toThrow("larger than /24");
    expect(() => expandCidr("10.0.0.300/24")).toThrow("not a valid");
    expect(() => expandCidr("printer")).toThrow("IPv4 range");
  });

  it("matches found hosts by MAC first, then by IP", () => {
    const assets = [
      { id: 1, ipAddress: "10.0.0.5", macAddress: "AA:BB:CC:00:11:22" },
      { id: 2, ipAddress: "10.0.0.9", macAddress: null },
    ];
    expect(reconcile({ ip: "10.0.0.5", mac: "aa-bb-cc-00-11-22" }, assets)).toEqual({ state: "registered", assetId: 1 });
    expect(reconcile({ ip: "10.0.0.50", mac: "aabb.cc00.1122" }, assets)).toEqual({ state: "ip_changed", assetId: 1 });
    expect(reconcile({ ip: "10.0.0.9", mac: null }, assets)).toEqual({ state: "registered", assetId: 2 });
    expect(reconcile({ ip: "10.0.0.77", mac: "de:ad:be:ef:00:01" }, assets)).toEqual({ state: "new", assetId: null });
  });

  it("reads MAC addresses from the ARP table on Windows and Linux, skipping broadcast", () => {
    const windows = [
      "Interface: 192.168.1.20 --- 0x7",
      "  Internet Address      Physical Address      Type",
      "  192.168.1.1           a4-2b-b0-11-22-33     dynamic",
      "  192.168.1.255         ff-ff-ff-ff-ff-ff     static",
    ].join("\r\n");
    expect(parseArp(windows)).toEqual(new Map([["192.168.1.1", "a4:2b:b0:11:22:33"]]));
    const linux = ["? (10.0.0.1) at 00:1B:A9:AA:BB:CC [ether] on eth0", "? (10.0.0.9) at <incomplete> on eth0"].join("\n");
    expect(parseArp(linux)).toEqual(new Map([["10.0.0.1", "00:1b:a9:aa:bb:cc"]]));
  });
});

describe("projects", () => {
  it("is overdue past its due date until completed", () => {
    expect(isProjectOverdue({ dueDate: "2026-09-28", status: "active" }, "2026-09-29")).toBe(true);
    expect(isProjectOverdue({ dueDate: "2026-09-29", status: "active" }, "2026-09-29")).toBe(false);
    expect(isProjectOverdue({ dueDate: "2026-09-28", status: "completed" }, "2026-09-29")).toBe(false);
    expect(isProjectOverdue({ dueDate: null, status: "on_hold" }, "2026-09-29")).toBe(false);
  });

  it("measures progress by tasks done", () => {
    expect(projectProgress(3, 8)).toBe(0.375);
    expect(projectProgress(0, 0)).toBe(0);
  });
});

describe("risk", () => {
  it("scores on the 5x5 grid", () => {
    expect(riskScore(4, 5)).toBe(20);
    expect([1, 4, 5, 9, 10, 16, 17, 25].map(riskLevel)).toEqual([
      "low",
      "low",
      "medium",
      "medium",
      "high",
      "high",
      "critical",
      "critical",
    ]);
  });

  it("flags open vulnerabilities past their deadline", () => {
    expect(isOverdue({ status: "open", deadline: "2026-09-28" }, "2026-09-29")).toBe(true);
    expect(isOverdue({ status: "in_progress", deadline: "2026-09-29" }, "2026-09-29")).toBe(false);
    expect(isOverdue({ status: "resolved", deadline: "2026-01-01" }, "2026-09-29")).toBe(false);
  });
});

describe("joiners and leavers", () => {
  it("tracks onboarding by phase", () => {
    const progress = onboardingProgress({ create_email: true, create_accounts: true, deliver_device: true });
    expect(progress).toMatchObject({ done: 3, total: 11 });
    expect(progress.phases).toEqual([
      { phase: "preparation", done: 2, total: 5 },
      { phase: "during", done: 1, total: 4 },
      { phase: "after", done: 0, total: 2 },
    ]);
    expect(onboardingComplete({ create_email: true })).toBe(false);
  });

  it("counts down the ninety-day mail forward", () => {
    expect(forwardingEnds("2026-07-01")).toBe("2026-09-29");
    expect(forwardingDaysLeft("2026-07-01", "2026-09-19")).toBe(10);
    expect(leaverState({ resignationDate: "2026-07-01", tasks: {} }, "2026-09-19")).toBe("forwarding");
    expect(leaverState({ resignationDate: "2026-07-01", tasks: {} }, "2026-09-29")).toBe("due");
    const done = Object.fromEntries(
      ["disable_account", "forward_mail", "collect_device", "revoke_access", "archive_mailbox", "delete_mailbox"].map(
        (t) => [t, true],
      ),
    );
    expect(leaverState({ resignationDate: "2026-07-01", tasks: done }, "2026-09-29")).toBe("completed");
  });
});

describe("KPIs", () => {
  it("rates each KPI against its baseline and target", () => {
    expect(rag("tat", 0.92, DEFAULT_KPI_TARGETS.tat)).toBe("green");
    expect(rag("tat", 0.8, DEFAULT_KPI_TARGETS.tat)).toBe("amber");
    expect(rag("tat", 0.6, DEFAULT_KPI_TARGETS.tat)).toBe("red");
    expect(rag("complaints", 8, DEFAULT_KPI_TARGETS.complaints)).toBe("green");
    expect(rag("complaints", 12, DEFAULT_KPI_TARGETS.complaints)).toBe("amber");
    expect(rag("complaints", 16, DEFAULT_KPI_TARGETS.complaints)).toBe("red");
    expect(rag("iso_ncs", 1, DEFAULT_KPI_TARGETS.iso_ncs)).toBe("amber");
    expect(rag("training_hours", 0, DEFAULT_KPI_TARGETS.training_hours)).toBe("red");
    expect(rag("satisfaction", null, DEFAULT_KPI_TARGETS.satisfaction)).toBe("none");
  });

  it("places a date in its Riyadh quarter", () => {
    expect(quarterOf("2026-03-31T20:00:00Z")).toEqual({ year: 2026, quarter: 1 });
    expect(quarterOf("2026-03-31T21:30:00Z")).toEqual({ year: 2026, quarter: 2 });
    expect(quarterOf("2026-12-31T12:00:00Z")).toEqual({ year: 2026, quarter: 4 });
  });
});
