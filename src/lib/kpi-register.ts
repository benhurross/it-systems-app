import { isoDate } from "./dates";
import type { KpiPeriod, KpiSource, KpiUnit, TicketType } from "./domain";

/**
 * The KPI register's arithmetic: each KPI's figure for every month (or quarter) of a year, from
 * what IT staff entered or worked out from the tickets, the year so far, how it stands against its
 * target, and each person's score from the weights set for their KPIs.
 */

/** Which tickets a KPI counts: all, or those of one type, issue type or IT person; `documented` also asks for a resolution note. */
export type KpiFilter = { type?: TicketType | null; issueType?: string | null; assigneeId?: string | null; documented?: boolean };

export type KpiDef = {
  id: number;
  unit: KpiUnit;
  period: KpiPeriod;
  source: KpiSource;
  filter: KpiFilter;
  higherIsBetter: boolean;
  /** Whether the target is for each month or quarter, or for the whole year (training hours, say). */
  targetFor: "period" | "year";
};
export type KpiYear = { baseline: number | null; baselineNote: string; target: number; weight: number | null };
export type KpiFigure = { period: number; numerator: number | null; denominator: number | null; value: number | null; note: string };

type When = Date | string;
export type KpiTicket = {
  type: TicketType;
  issueType: string;
  assigneeId: string | null;
  dueAt: When;
  resolvedAt: When | null;
  closedAt: When | null;
  satisfaction: number | null;
  documented: boolean;
};

export type Rag = "green" | "amber" | "red" | "none";
export type KpiCell = {
  period: number;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  /** Where the figure came from; null when there is none. */
  from: "tickets" | "entered" | null;
  note: string;
  /** Whether the month or quarter has begun, and whether it is over. */
  started: boolean;
  ended: boolean;
  /** How the month's or quarter's own figure stands against the target. */
  status: Rag;
};
/** A quarter of a KPI's year: its figure, and how it stands against the quarter's target. */
export type KpiQuarter = {
  quarter: number;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  judged: number | null;
  /** The quarter's target and baseline: the year's, or a quarter of it for a yearly total. */
  target: number;
  baseline: number | null;
  status: Rag;
  achievement: number | null;
  started: boolean;
  ended: boolean;
};

export type KpiResult = {
  cells: KpiCell[];
  quarters: KpiQuarter[];
  /** The year so far: the share over it, the mean score, or the total. */
  year: number | null;
  /**
   * The figure judged against the target: the year so far for shares and scores, and for
   * totals with a yearly target; the latest month or quarter that is over for counts judged
   * period by period (complaints a quarter).
   */
  judged: number | null;
  status: Rag;
  /** How far toward its target, from 0 to 1, for the weighted score. */
  achievement: number | null;
};

export const periodsIn = (period: KpiPeriod) => (period === "month" ? 12 : 4);

/** The month (1 to 12) or quarter (1 to 4) a moment falls in, in the app's time zone, with its year. */
export function periodOf(at: When, period: KpiPeriod) {
  const [year, month] = isoDate(at).split("-").map(Number);
  return { year, period: period === "month" ? month : Math.ceil(month / 3) };
}

const isIn = (at: When | null, year: number, p: number, period: KpiPeriod) => {
  if (!at) return false;
  const x = periodOf(at, period);
  return x.year === year && x.period === p;
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function matches(t: KpiTicket, f: KpiFilter) {
  return (!f.type || t.type === f.type) && (!f.issueType || t.issueType === f.issueType) && (!f.assigneeId || t.assigneeId === f.assigneeId);
}

/** A month or quarter's figure worked out from the tickets. */
function fromTickets(kpi: KpiDef, tickets: KpiTicket[], year: number, p: number, now: Date): Pick<KpiCell, "value" | "numerator" | "denominator"> | null {
  const counted = tickets.filter((t) => matches(t, kpi.filter));
  const late = (t: KpiTicket) => new Date(t.resolvedAt ?? now) > new Date(t.dueAt);
  if (kpi.source === "ticket_sla") {
    // Resolved in the period; within its SLA, and with a resolution note if the KPI asks for one.
    const resolved = counted.filter((t) => isIn(t.resolvedAt, year, p, kpi.period));
    if (!resolved.length) return null;
    const ok = resolved.filter((t) => !late(t) && (!kpi.filter.documented || t.documented)).length;
    return { numerator: ok, denominator: resolved.length, value: ok / resolved.length };
  }
  if (kpi.source === "sla_breaches") {
    // Tickets whose deadline fell in the period and was missed: complaints, as the workbook counts them.
    const missed = counted.filter((t) => isIn(t.dueAt, year, p, kpi.period) && new Date(t.dueAt) <= now && late(t)).length;
    return { numerator: null, denominator: null, value: missed };
  }
  if (kpi.source === "satisfaction") {
    const rating = mean(counted.filter((t) => isIn(t.closedAt, year, p, kpi.period) && t.satisfaction !== null).map((t) => t.satisfaction!));
    return rating === null ? null : { numerator: null, denominator: null, value: rating };
  }
  return null;
}

/** Green at or past target, amber short of it but past the baseline (or with no baseline), red at or behind the baseline. */
export function rag(higherIsBetter: boolean, actual: number | null, { baseline, target }: Pick<KpiYear, "baseline" | "target">): Rag {
  if (actual === null) return "none";
  const better = (a: number, b: number) => (higherIsBetter ? a >= b : a <= b);
  if (better(actual, target)) return "green";
  if (baseline === null || (better(actual, baseline) && actual !== baseline)) return "amber";
  return "red";
}

/** How much of its target a figure reaches, from 0 to 1. */
export function achievement(higherIsBetter: boolean, actual: number | null, target: number) {
  if (actual === null) return null;
  const share = higherIsBetter ? (target === 0 ? 1 : actual / target) : actual <= target ? 1 : actual === 0 ? 1 : target / actual;
  return Math.max(0, Math.min(1, share));
}

/** One KPI's year: every month or quarter, the year so far and how it stands. */
export function kpiResult(kpi: KpiDef, settings: KpiYear, figures: KpiFigure[], tickets: KpiTicket[], year: number, now = new Date()): KpiResult {
  const current = periodOf(now, kpi.period);
  // Each month or quarter on its own; a yearly total's target shared out over them (150 hours a
  // year is 37.5 a quarter).
  const shared = kpi.targetFor === "year" && (kpi.unit === "number" || kpi.unit === "hours");
  const n = periodsIn(kpi.period);
  const periodTargets = shared ? { target: settings.target / n, baseline: settings.baseline === null ? null : settings.baseline / n } : settings;
  const cells: KpiCell[] = Array.from({ length: periodsIn(kpi.period) }, (_, i) => {
    const p = i + 1;
    const started = year < current.year || (year === current.year && p <= current.period);
    const ended = year < current.year || (year === current.year && p < current.period);
    const entered = figures.find((f) => f.period === p);
    const note = entered?.note ?? "";
    const done = (figure: Pick<KpiCell, "value" | "numerator" | "denominator" | "from">): KpiCell => ({
      period: p,
      ...figure,
      note,
      started,
      ended,
      status: rag(kpi.higherIsBetter, figure.value, periodTargets),
    });
    // What IT staff entered stands; otherwise what the tickets say, once the period has begun.
    if (entered && (entered.value !== null || (entered.numerator !== null && entered.denominator))) {
      const value = entered.value ?? entered.numerator! / entered.denominator!;
      return done({ value, numerator: entered.numerator, denominator: entered.denominator, from: "entered" });
    }
    const worked = started && kpi.source !== "manual" ? fromTickets(kpi, tickets, year, p, now) : null;
    return done(worked ? { ...worked, from: "tickets" } : { value: null, numerator: null, denominator: null, from: null });
  });

  const known = cells.filter((c) => c.value !== null);
  const yearValue = combine(kpi.unit, known);
  // A share or score over the year compares with a monthly target as it stands; a count does not
  // (eight complaints a quarter is not 32 by the fourth), so it is the latest period that is over,
  // or the one under way when none is.
  const byYear = kpi.targetFor === "year" || kpi.unit === "percent" || kpi.unit === "score";
  const judged = byYear ? yearValue : latest(known);

  // Each quarter on its own: its months (or the quarter itself), judged as the year is. A yearly
  // total's target is shared out evenly: 150 training hours a year is 37.5 a quarter.
  const quarterTarget = shared ? settings.target / 4 : settings.target;
  const quarterBaseline = shared && settings.baseline !== null ? settings.baseline / 4 : settings.baseline;
  const quarters: KpiQuarter[] = [1, 2, 3, 4].map((q) => {
    const inQuarter = kpi.period === "quarter" ? cells.filter((c) => c.period === q) : cells.filter((c) => Math.ceil(c.period / 3) === q);
    const withFigures = inQuarter.filter((c) => c.value !== null);
    const value = combine(kpi.unit, withFigures);
    const counted = kpi.unit === "percent" && withFigures.length > 0 && withFigures.every((c) => c.numerator !== null && c.denominator);
    const quarterJudged = byYear || kpi.period === "quarter" ? value : latest(withFigures);
    return {
      quarter: q,
      value,
      numerator: counted ? withFigures.reduce((a, c) => a + c.numerator!, 0) : null,
      denominator: counted ? withFigures.reduce((a, c) => a + c.denominator!, 0) : null,
      judged: quarterJudged,
      target: quarterTarget,
      baseline: quarterBaseline,
      status: rag(kpi.higherIsBetter, quarterJudged, { baseline: quarterBaseline, target: quarterTarget }),
      achievement: achievement(kpi.higherIsBetter, quarterJudged, quarterTarget),
      started: inQuarter.some((c) => c.started),
      ended: inQuarter.every((c) => c.ended),
    };
  });
  return {
    cells,
    quarters,
    year: yearValue,
    judged,
    status: rag(kpi.higherIsBetter, judged, settings),
    achievement: achievement(kpi.higherIsBetter, judged, settings.target),
  };
}

/** Figures put together: counted shares add up (48 of 50 and 9 of 10 is 57 of 60), other shares and scores are averaged, counts and hours added. */
function combine(unit: KpiUnit, known: KpiCell[]) {
  if (!known.length) return null;
  if (unit === "percent") {
    const counted = known.every((c) => c.numerator !== null && c.denominator);
    return counted ? known.reduce((a, c) => a + c.numerator!, 0) / known.reduce((a, c) => a + c.denominator!, 0) : mean(known.map((c) => c.value!));
  }
  if (unit === "score") return mean(known.map((c) => c.value!));
  return known.reduce((a, c) => a + c.value!, 0);
}

/** The latest figure for a period that is over, or the one under way when none is. */
const latest = (known: KpiCell[]) => (known.filter((c) => c.ended).at(-1) ?? known.at(-1))?.value ?? null;

/**
 * A person's (or a role's) score: their KPIs' achievements, weighted as set for the year. KPIs
 * without a weight or a figure yet are left out, and `weighted` says how much of the weight is in.
 */
export function weightedScore(rows: { weight: number | null; achievement: number | null }[]) {
  const counted = rows.filter((r) => r.weight && r.achievement !== null);
  const weighted = counted.reduce((a, r) => a + r.weight!, 0);
  const total = rows.reduce((a, r) => a + (r.weight ?? 0), 0);
  return { score: weighted ? counted.reduce((a, r) => a + r.weight! * r.achievement!, 0) / weighted : null, weighted, total };
}
