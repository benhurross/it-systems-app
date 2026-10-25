import { eq, inArray } from "drizzle-orm";
import type { KpiPeriod, KpiSource, KpiUnit } from "@/lib/domain";
import { db } from "../db";
import { kpiActuals, kpiFigures, kpis, kpiYears, settings } from "../db/schema";

/**
 * The IT department's five KPIs, from the workbook, as the first entries of the KPI register. They
 * are ordinary entries: renamed, retargeted, given another source or removed like any other.
 */
export const DEFAULT_KPIS: {
  key: string;
  code: string;
  name: string;
  nameAr: string;
  definition: string;
  formula: string;
  higherIsBetter: boolean;
  unit: KpiUnit;
  period: KpiPeriod;
  targetFor: "period" | "year";
  source: KpiSource;
  dataSource: string;
  baseline: number;
  target: number;
}[] = [
  {
    key: "tat",
    code: "IT-TAT",
    name: "Tickets resolved within SLA",
    nameAr: "التذاكر المحلولة ضمن المدة",
    definition: "The share of tickets resolved within their SLA deadline.",
    formula: "Tickets resolved within SLA ÷ tickets resolved in the quarter.",
    higherIsBetter: true,
    unit: "percent",
    period: "quarter",
    targetFor: "period",
    source: "ticket_sla",
    dataSource: "Tickets",
    baseline: 0.68,
    target: 0.9,
  },
  {
    key: "complaints",
    code: "IT-SLA-BREACH",
    name: "Complaints (SLA breaches)",
    nameAr: "الشكاوى (تجاوز المدة)",
    definition: "Tickets whose SLA deadline fell in the quarter and was missed.",
    formula: "Count of tickets past their SLA deadline.",
    higherIsBetter: false,
    unit: "number",
    period: "quarter",
    targetFor: "period",
    source: "sla_breaches",
    dataSource: "Tickets",
    baseline: 16,
    target: 8,
  },
  {
    key: "training_hours",
    code: "IT-TRAINING",
    name: "IT training hours",
    nameAr: "ساعات تدريب فريق التقنية",
    definition: "Hours of training completed by the IT team, such as Udemy Business courses.",
    formula: "Total training hours in the year.",
    higherIsBetter: true,
    unit: "hours",
    period: "quarter",
    targetFor: "year",
    source: "manual",
    dataSource: "Training records",
    baseline: 0,
    target: 150,
  },
  {
    key: "iso_ncs",
    code: "IT-ISO",
    name: "ISO 9001 non-conformities",
    nameAr: "حالات عدم المطابقة ISO 9001",
    definition: "Non-conformities raised against IT in ISO 9001 audits.",
    formula: "Count of non-conformities in the year.",
    higherIsBetter: false,
    unit: "number",
    period: "quarter",
    targetFor: "year",
    source: "manual",
    dataSource: "ISO audit reports",
    baseline: 2,
    target: 0,
  },
  {
    key: "satisfaction",
    code: "IT-CSAT",
    name: "IT service satisfaction",
    nameAr: "رضا المستخدمين عن الخدمة",
    definition: "The mean rating requesters give when their tickets are closed.",
    formula: "Average of ticket ratings, 1 to 5.",
    higherIsBetter: true,
    unit: "score",
    period: "quarter",
    targetFor: "period",
    source: "satisfaction",
    dataSource: "Ticket ratings",
    baseline: 3.5,
    target: 4.5,
  },
];

const READY = "kpi_register";
const OLD_TARGETS = "kpi_targets";
let ready: Promise<void> | null = null;

/**
 * Sets up the register once: the five KPIs, with the baselines and targets set for each year in
 * Settings before the register and the quarterly figures entered by hand, which move across.
 */
export function ensureKpiRegister(year = new Date().getFullYear()) {
  ready ??= (async () => {
    const [done] = await db.select().from(settings).where(eq(settings.key, READY));
    if (done) return;
    await db.transaction(async (tx) => {
      const existing = await tx.select({ code: kpis.code }).from(kpis).where(inArray(kpis.code, DEFAULT_KPIS.map((k) => k.code)));
      const missing = DEFAULT_KPIS.filter((k) => !existing.some((e) => e.code === k.code));
      const made = missing.length
        ? await tx
            .insert(kpis)
            .values(
              missing.map((k, i) => ({
                code: k.code,
                name: k.name,
                nameAr: k.nameAr,
                definition: k.definition,
                formula: k.formula,
                higherIsBetter: k.higherIsBetter,
                unit: k.unit,
                period: k.period,
                targetFor: k.targetFor,
                source: k.source,
                dataSource: k.dataSource,
                level: "department" as const,
                role: "IT department",
                frequency: "Quarterly",
                sortOrder: i + 1,
              })),
            )
            .returning({ id: kpis.id, code: kpis.code })
        : [];
      const idOf = new Map(made.map((m) => [DEFAULT_KPIS.find((k) => k.code === m.code)!.key, m.id]));
      const [old] = await tx.select().from(settings).where(eq(settings.key, OLD_TARGETS));
      const byYear = (old?.value ?? {}) as Record<string, Record<string, { baseline: number; target: number }>>;
      for (const [key, id] of idOf) {
        const k = DEFAULT_KPIS.find((d) => d.key === key)!;
        const years = Object.entries(byYear).filter(([, t]) => t[key]);
        const rows = years.map(([y, t]) => ({ year: Number(y), ...t[key] }));
        // A year without targets in Settings had the workbook's; this one keeps them.
        if (!rows.some((r) => r.year === year)) rows.push({ year, baseline: k.baseline, target: k.target });
        await tx.insert(kpiYears).values(rows.map((r) => ({ kpiId: id, ...r }))).onConflictDoNothing();
      }
      // Quarterly figures entered before the register.
      const actuals = await tx.select().from(kpiActuals);
      const figures = actuals.filter((a) => idOf.has(a.kpi)).map((a) => ({ kpiId: idOf.get(a.kpi)!, year: a.year, period: a.quarter, value: a.value }));
      if (figures.length) await tx.insert(kpiFigures).values(figures).onConflictDoNothing();
      await tx.insert(settings).values({ key: READY, value: true }).onConflictDoNothing();
    });
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Forgets that the register is set up, for tests and demo data that start the database again. */
export function resetKpiRegister() {
  ready = null;
}
