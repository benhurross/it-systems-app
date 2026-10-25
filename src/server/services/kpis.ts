import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { type KpiYear, kpiResult, weightedScore } from "@/lib/kpi-register";
import type { kpiFigureInput, kpiInput, kpiYearInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { kpiFigures, kpis, kpiYears, tickets, users } from "../db/schema";
import { badRequest, one } from "../http";
import { ensureKpiRegister } from "../seed/kpi-defaults";

/** A KPI's settings for a year: that year's, else the latest year before it, else the first after. */
export function settingsFor(rows: (KpiYear & { year: number })[], year: number): KpiYear & { year: number | null } {
  const sorted = [...rows].sort((a, b) => a.year - b.year);
  const row = [...sorted].reverse().find((r) => r.year <= year) ?? sorted[0];
  return row ? { year: row.year, baseline: row.baseline, baselineNote: row.baselineNote, target: row.target, weight: row.weight } : { year: null, baseline: null, baselineNote: "", target: 0, weight: null };
}

/**
 * The register for a year: every KPI with its figures month by month (or quarter by quarter), the
 * year so far and its status, and the weighted score of each role from the weights set for the year.
 */
export async function kpiRegister(year: number, now = new Date()) {
  await ensureKpiRegister();
  const [list, years, figures, ticketRows] = await Promise.all([
    db
      .select({ kpi: kpis, ownerName: users.name })
      .from(kpis)
      .leftJoin(users, eq(users.id, kpis.ownerId))
      .orderBy(asc(kpis.sortOrder), asc(kpis.code)),
    db.select().from(kpiYears),
    db.select().from(kpiFigures).where(eq(kpiFigures.year, year)),
    db
      .select({
        type: tickets.type,
        issueType: tickets.issueType,
        assigneeId: tickets.assigneeId,
        dueAt: tickets.dueAt,
        resolvedAt: tickets.resolvedAt,
        closedAt: tickets.closedAt,
        satisfaction: tickets.satisfaction,
        documented: sql<boolean>`coalesce(btrim(${tickets.resolution}), '') <> ''`,
      })
      .from(tickets),
  ]);
  const rows = list.map(({ kpi, ownerName }) => {
    const settings = settingsFor(
      years.filter((y) => y.kpiId === kpi.id),
      year,
    );
    const result = kpiResult(kpi, settings, figures.filter((f) => f.kpiId === kpi.id), kpi.source === "manual" ? [] : ticketRows, year, now);
    return { ...kpi, ownerName, settings, ...result };
  });
  // Each role's score: the active KPIs that apply to it, by their weights.
  const roles = [...new Set(rows.filter((r) => r.active).map((r) => r.role))].map((role) => {
    const theirs = rows.filter((r) => r.active && r.role === role);
    return {
      role,
      level: theirs[0].level,
      ...weightedScore(theirs.map((r) => ({ weight: r.settings.weight, achievement: r.achievement }))),
      // And each quarter's, from the KPIs' quarter figures.
      quarters: [1, 2, 3, 4].map((q) => ({ quarter: q, ...weightedScore(theirs.map((r) => ({ weight: r.settings.weight, achievement: r.quarters[q - 1].achievement }))) })),
    };
  });
  return { year, rows, roles };
}

const clean = (input: z.infer<typeof kpiInput>) => ({ ...input, filter: input.source === "manual" ? {} : input.filter });

async function codeFree(code: string, except?: number) {
  const [taken] = await db.select({ id: kpis.id }).from(kpis).where(eq(kpis.code, code));
  // Reported on the field, as the form's own checks are.
  if (taken && taken.id !== except) throw new z.ZodError([{ code: "custom", path: ["code"], message: "validation.kpiCode", input: code }]);
}

export async function createKpi(input: z.infer<typeof kpiInput>, settings: z.infer<typeof kpiYearInput>, year: number, actor: Actor) {
  await ensureKpiRegister();
  await codeFree(input.code);
  const row = await db.transaction(async (tx) => {
    const made = one(await tx.insert(kpis).values(clean(input)).returning());
    await tx.insert(kpiYears).values({ kpiId: made.id, year, ...settings });
    return made;
  });
  await audit(actor, "create", "kpi", row.id, `Added KPI ${row.code}: ${row.name}`);
  return row;
}

export async function updateKpi(id: number, input: z.infer<typeof kpiInput>, actor: Actor) {
  await codeFree(input.code, id);
  const row = one(await db.update(kpis).set(clean(input)).where(eq(kpis.id, id)).returning());
  await audit(actor, "update", "kpi", id, `Updated KPI ${row.code}: ${row.name}`);
  return row;
}

export async function deleteKpi(id: number, actor: Actor) {
  const row = one(await db.delete(kpis).where(eq(kpis.id, id)).returning());
  await audit(actor, "delete", "kpi", id, `Deleted KPI ${row.code}: ${row.name}`);
  return { id };
}

/** A KPI's baseline, target and weight for a year. */
export async function setKpiYear(id: number, year: number, input: z.infer<typeof kpiYearInput>, actor: Actor) {
  const kpi = one(await db.select().from(kpis).where(eq(kpis.id, id)));
  await db
    .insert(kpiYears)
    .values({ kpiId: id, year, ...input })
    .onConflictDoUpdate({ target: [kpiYears.kpiId, kpiYears.year], set: input });
  await audit(actor, "update", "kpi", id, `Set ${kpi.code} for ${year}: target ${input.target}${input.weight !== null ? `, weight ${input.weight}%` : ""}`);
}

/** A month's or quarter's figure for a KPI, as entered; an empty figure without a note is removed. */
export async function setKpiFigure(id: number, input: z.infer<typeof kpiFigureInput>, actor: Actor) {
  const kpi = one(await db.select().from(kpis).where(eq(kpis.id, id)));
  if (input.period > (kpi.period === "month" ? 12 : 4)) throw badRequest("kpiPeriod");
  const where = and(eq(kpiFigures.kpiId, id), eq(kpiFigures.year, input.year), eq(kpiFigures.period, input.period));
  const { year, period, ...figure } = input;
  const label = `${kpi.code} ${year} ${kpi.period === "month" ? `month ${period}` : `Q${period}`}`;
  if (figure.numerator === null && figure.value === null && !figure.note) {
    await db.delete(kpiFigures).where(where);
    await audit(actor, "update", "kpi", id, `Cleared ${label}`);
    return;
  }
  const values = { ...figure, updatedBy: actor.name };
  await db
    .insert(kpiFigures)
    .values({ kpiId: id, year, period, ...values })
    .onConflictDoUpdate({ target: [kpiFigures.kpiId, kpiFigures.year, kpiFigures.period], set: values });
  const shown = figure.numerator !== null ? `${figure.numerator} of ${figure.denominator}` : figure.value !== null ? String(figure.value) : "a note";
  await audit(actor, "update", "kpi", id, `Recorded ${label}: ${shown}`);
}
