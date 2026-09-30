import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { kpiReport } from "@/lib/kpis";
import type { kpiActualsInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { kpiActuals, tickets } from "../db/schema";
import { getKpiTargets } from "../settings";

/** A year's five KPIs against the baselines and targets set for that year. */
export async function kpis(year: number, now = new Date()) {
  const [ticketRows, entered, targets] = await Promise.all([
    db
      .select({
        createdAt: tickets.createdAt,
        dueAt: tickets.dueAt,
        resolvedAt: tickets.resolvedAt,
        closedAt: tickets.closedAt,
        satisfaction: tickets.satisfaction,
      })
      .from(tickets),
    db.select().from(kpiActuals).where(eq(kpiActuals.year, year)),
    getKpiTargets(year),
  ]);
  return { year, rows: kpiReport({ tickets: ticketRows, entered }, year, targets, now) };
}

/** Records a year's quarterly figures for a KPI entered by hand; an empty quarter is cleared. */
export async function setKpiActuals(input: z.infer<typeof kpiActualsInput>, actor: Actor) {
  await db.transaction(async (tx) => {
    for (const [i, value] of input.quarters.entries()) {
      const quarter = i + 1;
      const row = and(eq(kpiActuals.year, input.year), eq(kpiActuals.quarter, quarter), eq(kpiActuals.kpi, input.kpi));
      if (value === null) await tx.delete(kpiActuals).where(row);
      else {
        await tx
          .insert(kpiActuals)
          .values({ year: input.year, quarter, kpi: input.kpi, value })
          .onConflictDoUpdate({ target: [kpiActuals.year, kpiActuals.quarter, kpiActuals.kpi], set: { value } });
      }
    }
  });
  const shown = input.quarters.map((v, i) => `Q${i + 1} ${v ?? "–"}`).join(", ");
  await audit(actor, "update", "kpi", `${input.kpi}/${input.year}`, `Recorded ${input.kpi} for ${input.year}: ${shown}`);
}
