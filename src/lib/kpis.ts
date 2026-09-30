import { isoDate } from "./dates";
import { KPI_KEYS, type KpiKey } from "./domain";

export type KpiTarget = { baseline: number; target: number };
export type KpiTargets = Record<KpiKey, KpiTarget>;

/** Baselines and targets from the workbook's KPI sheet. */
export const DEFAULT_KPI_TARGETS: KpiTargets = {
  tat: { baseline: 0.68, target: 0.9 },
  complaints: { baseline: 16, target: 8 },
  training_hours: { baseline: 0, target: 150 },
  iso_ncs: { baseline: 2, target: 0 },
  satisfaction: { baseline: 3.5, target: 4.5 },
};

/** Whether more is better. Complaints and non-conformities should go down. */
export const HIGHER_IS_BETTER: Record<KpiKey, boolean> = {
  tat: true,
  complaints: false,
  training_hours: true,
  iso_ncs: false,
  satisfaction: true,
};

export type Rag = "green" | "amber" | "red" | "none";

/** Green at or past target, amber past the baseline but short of target, red at or behind the baseline. */
export function rag(kpi: KpiKey, actual: number | null, { baseline, target }: KpiTarget): Rag {
  if (actual === null) return "none";
  const better = (a: number, b: number) => (HIGHER_IS_BETTER[kpi] ? a >= b : a <= b);
  if (better(actual, target)) return "green";
  if (better(actual, baseline) && actual !== baseline) return "amber";
  return "red";
}

export function quarterOf(at: Date | string): { year: number; quarter: number } {
  const [year, month] = isoDate(at).split("-").map(Number);
  return { year, quarter: Math.ceil(month / 3) };
}

/**
 * KPIs judged quarter by quarter against their target. Training hours and ISO non-conformities
 * add up over the year instead, so the year's total is what meets or misses theirs.
 */
export const QUARTERLY: Record<KpiKey, boolean> = {
  tat: true,
  complaints: true,
  satisfaction: true,
  training_hours: false,
  iso_ncs: false,
};

type When = Date | string;
type KpiTicket = { createdAt: When; dueAt: When; resolvedAt: When | null; closedAt: When | null; satisfaction: number | null };

export type KpiRow = KpiTarget & {
  kpi: KpiKey;
  /** Q1 to Q4; null before a quarter starts, or when there is nothing to measure. */
  quarters: (number | null)[];
  /** The year so far: the share or average over it, or the total for KPIs that add up. */
  year: number | null;
  /** The latest measured quarter for quarterly KPIs, the year so far for the others. */
  status: Rag;
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const sum = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};

/**
 * One year's KPIs. From tickets: the share resolved within SLA among those resolved in each quarter,
 * complaints as tickets whose SLA deadline fell in the quarter and was missed, and the mean rating
 * of tickets closed in it. Training hours and ISO non-conformities come from what IT staff entered.
 */
export function kpiReport(
  input: { tickets: KpiTicket[]; entered: { quarter: number; kpi: string; value: number }[] },
  year: number,
  targets: KpiTargets,
  now = new Date(),
): KpiRow[] {
  const current = quarterOf(now);
  const started = (q: number) => year < current.year || (year === current.year && q <= current.quarter);
  const inQuarter = (at: When | null, q: number) => {
    if (!at) return false;
    const x = quarterOf(at);
    return x.year === year && x.quarter === q;
  };
  const inYear = (at: When | null) => !!at && quarterOf(at).year === year;
  const breached = (t: KpiTicket) => new Date(t.resolvedAt ?? now) > new Date(t.dueAt);
  const due = (t: KpiTicket) => new Date(t.dueAt) <= now;

  const share = (tickets: KpiTicket[]) => {
    const resolved = tickets.filter((t) => t.resolvedAt);
    return resolved.length ? resolved.filter((t) => !breached(t)).length / resolved.length : null;
  };
  const rating = (tickets: KpiTicket[]) => mean(tickets.map((t) => t.satisfaction).filter((s): s is number => s !== null));

  const measure: Record<KpiKey, (q: number | null) => number | null> = {
    tat: (q) => share(input.tickets.filter((t) => (q ? inQuarter(t.resolvedAt, q) : inYear(t.resolvedAt)))),
    complaints: (q) => input.tickets.filter((t) => (q ? inQuarter(t.dueAt, q) : inYear(t.dueAt)) && due(t) && breached(t)).length,
    satisfaction: (q) => rating(input.tickets.filter((t) => (q ? inQuarter(t.closedAt, q) : inYear(t.closedAt)))),
    training_hours: (q) => input.entered.find((e) => e.kpi === "training_hours" && e.quarter === q)?.value ?? null,
    iso_ncs: (q) => input.entered.find((e) => e.kpi === "iso_ncs" && e.quarter === q)?.value ?? null,
  };

  return KPI_KEYS.map((kpi) => {
    const quarters = [1, 2, 3, 4].map((q) => (started(q) ? measure[kpi](q) : null));
    const year_ = QUARTERLY[kpi] ? (kpi === "complaints" ? sum(quarters) : measure[kpi](null)) : sum(quarters);
    const latest = [...quarters].reverse().find((v) => v !== null) ?? null;
    return {
      kpi,
      ...targets[kpi],
      quarters,
      year: year_,
      status: rag(kpi, QUARTERLY[kpi] ? latest : year_, targets[kpi]),
    };
  });
}
