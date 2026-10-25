import type { useFormat } from "@/hooks/use-format";
import type { KpiUnit } from "@/lib/domain";

type Words = (key: "kpis.outOf" | "kpis.hoursValue", values: { value: string }) => string;

/** A KPI figure as it reads: 99.91%, 42 h, 4.2 / 5, or a count. */
export function showKpi(unit: KpiUnit, value: number | null, format: ReturnType<typeof useFormat>, t: Words) {
  if (value === null) return "—";
  if (unit === "percent") return format.number(value, { style: "percent", maximumFractionDigits: 2 });
  if (unit === "score") return t("kpis.outOf", { value: format.number(value, { maximumFractionDigits: 1 }) });
  if (unit === "hours") return t("kpis.hoursValue", { value: format.number(value, { maximumFractionDigits: 1 }) });
  return format.number(value, { maximumFractionDigits: 2 });
}
