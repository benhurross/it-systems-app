import { describe, expect, it } from "vitest";
import { ATTENTION_LIMIT, dashboardSummary, lastMonths, type DashboardInput } from "@/lib/dashboard";
import { RECENT_CLOSED_DAYS, requesterSummary } from "@/lib/self-service";

// Noon in Riyadh on 29 September 2026.
const NOW = new Date("2026-09-29T09:00:00Z");
const at = (iso: string) => new Date(`${iso}T09:00:00Z`);

const empty: DashboardInput = {
  tickets: [],
  assets: [],
  availability: [],
  licenses: [],
  contracts: [],
  budget: { fiscalYear: 2026, lines: [] },
  risks: [],
  vulnerabilities: [],
  leavers: [],
};

type Ticket = DashboardInput["tickets"][number];
const ticket = (id: number, t: Partial<Ticket>): Ticket => ({
  id,
  subject: `Ticket ${id}`,
  status: "open",
  issueType: "hardware",
  createdAt: at("2026-09-20"),
  dueAt: at("2026-09-30"),
  resolvedAt: null,
  closedAt: null,
  ...t,
});

type Asset = DashboardInput["assets"][number];
const asset = (id: number, a: Partial<Asset>): Asset => ({
  id,
  name: `AST ${id}`,
  category: "end_user",
  status: "in_use",
  purchaseDate: "2025-01-01",
  warrantyEnd: "2028-01-01",
  supportStatus: "supported",
  monitorStatus: null,
  ...a,
});

describe("dashboard", () => {
  it("lists the last twelve months, across a year end", () => {
    expect(lastMonths("2026-09-29")).toEqual([
      "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
    ]);
    expect(lastMonths("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("counts open tickets and breaches, and measures service over the last 30 days only", () => {
    const { tiles } = dashboardSummary(
      {
        ...empty,
        tickets: [
          ticket(1, { status: "open" }),
          ticket(2, { status: "in_progress", dueAt: at("2026-09-28") }),
          ticket(3, { status: "on_hold", dueAt: at("2026-09-01") }),
          // Resolved recently: one within its SLA taking 24 hours, one late taking 72.
          ticket(4, { status: "closed", createdAt: at("2026-09-10"), dueAt: at("2026-09-12"), resolvedAt: at("2026-09-11") }),
          ticket(5, { status: "resolved", createdAt: at("2026-09-10"), dueAt: at("2026-09-11"), resolvedAt: at("2026-09-13") }),
          // Resolved long ago, late: left out of the recent figures.
          ticket(6, { status: "closed", createdAt: at("2026-06-01"), dueAt: at("2026-06-02"), resolvedAt: at("2026-06-20") }),
        ],
      },
      NOW,
    );
    expect(tiles.openTickets).toBe(3);
    expect(tiles.breached).toBe(2);
    expect(tiles.slaCompliance).toBe(0.5);
    expect(tiles.averageResolutionHours).toBe(48);
  });

  it("averages availability over devices that were checked, and counts live devices that are down", () => {
    const { tiles } = dashboardSummary(
      {
        ...empty,
        availability: [1, 0.5, null],
        assets: [
          asset(1, { monitorStatus: "down" }),
          asset(2, { monitorStatus: "up", status: "in_stock" }),
          asset(3, { monitorStatus: "down", status: "retired" }),
        ],
      },
      NOW,
    );
    expect(tiles.availability).toBe(0.75);
    expect(tiles.devicesDown).toBe(1);
    expect(tiles.assetsInUse).toBe(1);
    expect(tiles.assets).toBe(2);
  });

  it("works out licence compliance, budget use and open high risks", () => {
    const { tiles } = dashboardSummary(
      {
        ...empty,
        licenses: [
          { id: 1, product: "Office", seats: 10, installs: 5, expiryDate: null },
          { id: 2, product: "CAD", seats: 2, installs: 3, expiryDate: null },
        ],
        budget: { fiscalYear: 2026, lines: [{ category: "hardware", budget: 1000, committed: 250 }] },
        risks: [
          { likelihood: 4, impact: 4, status: "open" },
          { likelihood: 5, impact: 5, status: "mitigating" },
          { likelihood: 5, impact: 5, status: "closed" },
          { likelihood: 2, impact: 3, status: "open" },
        ],
      },
      NOW,
    );
    expect(tiles.licenseCompliance).toBe(0.5);
    expect(tiles.budgetUtilisation).toBe(0.25);
    expect(tiles.openHighRisks).toBe(2);
    expect(dashboardSummary(empty, NOW).tiles).toMatchObject({ budgetUtilisation: null, licenseCompliance: null, availability: null });
  });

  it("groups what needs attention, soonest first, listing a few and counting all", () => {
    const { attention } = dashboardSummary(
      {
        ...empty,
        tickets: Array.from({ length: 7 }, (_, i) => ticket(i + 1, { dueAt: at(`2026-09-0${7 - i}`) })),
        assets: [
          asset(1, { name: "AP-01", monitorStatus: "down" }),
          asset(2, { name: "LT-02", warrantyEnd: "2026-11-01" }),
          asset(3, { name: "LT-03", warrantyEnd: "2026-10-15" }),
          asset(4, { name: "LT-04", warrantyEnd: "2027-06-01" }),
        ],
        licenses: [
          { id: 1, product: "Scanner", seats: 1, installs: 1, expiryDate: "2026-10-10" },
          { id: 2, product: "CAD", seats: 1, installs: 1, expiryDate: "2026-09-01" },
          { id: 3, product: "Office", seats: 1, installs: 1, expiryDate: null },
        ],
        contracts: [
          { id: 1, title: "Internet", endDate: "2026-11-20" },
          { id: 2, title: "Old VPN", endDate: "2026-08-01" },
        ],
        vulnerabilities: [
          { id: 1, title: "Old TLS", status: "open", deadline: "2026-09-01" },
          { id: 2, title: "Patched", status: "resolved", deadline: "2026-09-01" },
        ],
        leavers: [
          { id: 1, name: "Former", resignationDate: "2026-05-01", tasks: {} },
          { id: 2, name: "Recent", resignationDate: "2026-09-01", tasks: {} },
        ],
      },
      NOW,
    );
    const byKind = Object.fromEntries(attention.map((g) => [g.kind, g]));
    expect(attention.map((g) => g.kind)).toEqual(["sla", "down", "licenses", "contracts", "warranties", "vulnerabilities", "offboarding"]);
    expect(byKind.sla.count).toBe(7);
    expect(byKind.sla.items).toHaveLength(ATTENTION_LIMIT);
    expect(byKind.sla.items[0]).toMatchObject({ id: 7, label: "IT000007 Ticket 7", href: "/tickets/7" });
    expect(byKind.licenses.items.map((i) => i.label)).toEqual(["CAD", "Scanner"]);
    expect(byKind.contracts.items.map((i) => i.label)).toEqual(["Internet"]);
    expect(byKind.warranties.items.map((i) => i.label)).toEqual(["LT-03", "LT-02"]);
    expect(byKind.vulnerabilities.items.map((i) => i.label)).toEqual(["Old TLS"]);
    expect(byKind.offboarding.items).toEqual([{ id: 1, label: "Former", date: "2026-07-30", href: "/people/offboarding" }]);
    expect(dashboardSummary(empty, NOW).attention).toEqual([]);
  });

  it("charts tickets by month and issue type over a year, and assets and budget by category", () => {
    const { charts } = dashboardSummary(
      {
        ...empty,
        tickets: [
          ticket(1, { createdAt: at("2026-09-02"), issueType: "email" }),
          ticket(2, { createdAt: at("2026-08-30"), closedAt: at("2026-09-01"), status: "closed", issueType: "email" }),
          ticket(3, { createdAt: at("2025-10-01"), closedAt: at("2025-10-02"), status: "closed" }),
          ticket(4, { createdAt: at("2025-09-30"), closedAt: at("2025-10-01"), status: "closed" }),
        ],
        assets: [asset(1, {}), asset(2, {}), asset(3, { category: "servers" }), asset(4, { category: "servers", status: "retired" })],
        budget: { fiscalYear: 2026, lines: [{ category: "hardware", budget: 100, committed: 40 }] },
      },
      NOW,
    );
    expect(charts.ticketsByMonth).toHaveLength(12);
    expect(charts.ticketsByMonth.at(-1)).toEqual({ month: "2026-09", opened: 1, closed: 1 });
    expect(charts.ticketsByMonth.at(-2)).toEqual({ month: "2026-08", opened: 1, closed: 0 });
    expect(charts.ticketsByMonth[0]).toEqual({ month: "2025-10", opened: 1, closed: 2 });
    expect(charts.ticketsByIssueType).toEqual([
      { issueType: "email", count: 2 },
      { issueType: "hardware", count: 1 },
    ]);
    expect(charts.assetsByCategory).toEqual([
      { category: "end_user", count: 2 },
      { category: "servers", count: 1 },
    ]);
    expect(charts.budget).toEqual([{ category: "hardware", budget: 100, committed: 40 }]);
  });
});

describe("a requester's own summary", () => {
  it("counts requests in progress, waiting for confirmation, and closed in the recent window", () => {
    const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3_600_000);
    expect(
      requesterSummary(
        [
          { status: "open", closedAt: null },
          { status: "in_progress", closedAt: null },
          { status: "on_hold", closedAt: null },
          { status: "resolved", closedAt: null },
          { status: "closed", closedAt: daysAgo(1) },
          { status: "closed", closedAt: daysAgo(RECENT_CLOSED_DAYS - 1) },
          { status: "closed", closedAt: daysAgo(RECENT_CLOSED_DAYS + 1) },
        ],
        NOW,
      ),
    ).toEqual({ open: 3, awaiting: 1, closedRecently: 2 });
    expect(requesterSummary([], NOW)).toEqual({ open: 0, awaiting: 0, closedRecently: 0 });
  });
});
