import { isoDate } from "./dates";
import type { KpiKey } from "./domain";

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
