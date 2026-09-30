import { isoDate } from "./dates";
import { ref, type AssetStatus, type DeviceStatus, type RiskStatus, type SupportStatus, type TicketStatus, type VulnStatus } from "./domain";
import { contractState } from "./finance";
import { compliance, licenseState } from "./licenses";
import { assetFlags } from "./lifecycle";
import { forwardingEnds, leaverState } from "./people";
import { isOverdue, riskLevel, riskScore } from "./risk";
import { averageResolutionHours, isBreached, slaCompliance } from "./sla";

/** Service figures cover tickets resolved in the last 30 days. */
export const RECENT_DAYS = 30;
/** How many items each "needs attention" group lists; the count covers them all. */
export const ATTENTION_LIMIT = 5;

type When = Date | string;

export type DashboardInput = {
  tickets: {
    id: number;
    subject: string;
    status: TicketStatus;
    issueType: string;
    createdAt: When;
    dueAt: When;
    resolvedAt: When | null;
    closedAt: When | null;
  }[];
  assets: {
    id: number;
    name: string;
    category: string;
    status: AssetStatus;
    purchaseDate: string | null;
    warrantyEnd: string | null;
    supportStatus: SupportStatus;
    monitorStatus: DeviceStatus | null;
  }[];
  /** Share of successful checks per monitored device over the last day. */
  availability: (number | null)[];
  licenses: { id: number; product: string; seats: number; installs: number; expiryDate: string | null }[];
  contracts: { id: number; title: string; endDate: string }[];
  budget: { fiscalYear: number; lines: { category: string; budget: number; committed: number }[] };
  risks: { likelihood: number; impact: number; status: RiskStatus }[];
  vulnerabilities: { id: number; title: string; status: VulnStatus; deadline: string }[];
  leavers: { id: number; name: string; resignationDate: string; tasks: Record<string, boolean> }[];
};

export const ATTENTION_KINDS = ["sla", "down", "licenses", "contracts", "warranties", "vulnerabilities", "offboarding"] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];
/** One thing to look at: `date` is when it fell or falls due. */
export type AttentionItem = { id: number; label: string; date: string | null; href: string };
export type AttentionGroup = { kind: AttentionKind; count: number; items: AttentionItem[] };

const OPEN: readonly TicketStatus[] = ["open", "in_progress", "on_hold"];

/** The last twelve months as YYYY-MM, oldest first, ending with the current one. */
export function lastMonths(today: string, n = 12): string[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const total = year * 12 + (month - 1) - (n - 1 - i);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

const tally = <T>(items: T[], key: (item: T) => string) => {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

const group = (kind: AttentionKind, items: AttentionItem[]): AttentionGroup => ({
  kind,
  count: items.length,
  items: items.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).slice(0, ATTENTION_LIMIT),
});

export function dashboardSummary(data: DashboardInput, now = new Date()) {
  const today = isoDate(now);
  const since = new Date(now.getTime() - RECENT_DAYS * 24 * 3_600_000);
  const open = data.tickets.filter((t) => OPEN.includes(t.status));
  const breached = open.filter((t) => isBreached(t, now));
  const recent = data.tickets.filter((t) => t.resolvedAt && new Date(t.resolvedAt) >= since);
  const live = data.assets.filter((a) => a.status !== "retired");
  const measured = data.availability.filter((a): a is number => a !== null);
  const budget = data.budget.lines.reduce((n, l) => n + l.budget, 0);
  const committed = data.budget.lines.reduce((n, l) => n + l.committed, 0);
  const licenseStates = data.licenses.map((l) => ({ l, state: licenseState(l, l.installs, today) }));

  const months = lastMonths(today);
  const monthOf = (at: When) => isoDate(at).slice(0, 7);
  const yearAgo = `${months[0]}-01`;

  return {
    tiles: {
      openTickets: open.length,
      breached: breached.length,
      slaCompliance: slaCompliance(recent),
      averageResolutionHours: averageResolutionHours(recent),
      availability: measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null,
      devicesDown: live.filter((a) => a.monitorStatus === "down").length,
      assetsInUse: live.filter((a) => a.status === "in_use").length,
      assets: live.length,
      licenseCompliance: compliance(licenseStates.map((x) => x.state)),
      budgetUtilisation: budget > 0 ? committed / budget : null,
      fiscalYear: data.budget.fiscalYear,
      openHighRisks: data.risks.filter((r) => r.status !== "closed" && ["high", "critical"].includes(riskLevel(riskScore(r.likelihood, r.impact)))).length,
    },
    attention: [
      group(
        "sla",
        breached.map((t) => ({ id: t.id, label: `${ref("ticket", t.id)} ${t.subject}`, date: new Date(t.dueAt).toISOString(), href: `/tickets/${t.id}` })),
      ),
      group(
        "down",
        live.filter((a) => a.monitorStatus === "down").map((a) => ({ id: a.id, label: a.name, date: null, href: `/assets/${a.id}` })),
      ),
      group(
        "licenses",
        licenseStates
          .filter((x) => x.state === "expiring" || x.state === "expired")
          .map(({ l }) => ({ id: l.id, label: l.product, date: l.expiryDate, href: `/software/${l.id}` })),
      ),
      group(
        "contracts",
        data.contracts
          .filter((c) => contractState(c, today) === "expiring")
          .map((c) => ({ id: c.id, label: c.title, date: c.endDate, href: "/finance/contracts" })),
      ),
      group(
        "warranties",
        live
          .filter((a) => assetFlags(a, today).warrantyExpiring)
          .map((a) => ({ id: a.id, label: a.name, date: a.warrantyEnd, href: `/assets/${a.id}` })),
      ),
      group(
        "vulnerabilities",
        data.vulnerabilities
          .filter((v) => isOverdue(v, today))
          .map((v) => ({ id: v.id, label: v.title, date: v.deadline, href: "/risk/vulnerabilities" })),
      ),
      group(
        "offboarding",
        data.leavers
          .filter((l) => leaverState(l, today) === "due")
          .map((l) => ({ id: l.id, label: l.name, date: forwardingEnds(l.resignationDate), href: "/people/offboarding" })),
      ),
    ].filter((g) => g.count > 0),
    charts: {
      ticketsByMonth: months.map((month) => ({
        month,
        opened: data.tickets.filter((t) => monthOf(t.createdAt) === month).length,
        closed: data.tickets.filter((t) => t.closedAt && monthOf(t.closedAt) === month).length,
      })),
      ticketsByIssueType: tally(
        data.tickets.filter((t) => isoDate(t.createdAt) >= yearAgo),
        (t) => t.issueType,
      ).map(({ key, count }) => ({ issueType: key, count })),
      assetsByCategory: tally(live, (a) => a.category).map(({ key, count }) => ({ category: key, count })),
      budget: data.budget.lines.map(({ category, budget, committed }) => ({ category, budget, committed })),
    },
  };
}

export type Dashboard = ReturnType<typeof dashboardSummary>;
