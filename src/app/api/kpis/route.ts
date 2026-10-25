import { z } from "zod";
import { kpiInput, kpiYearInput } from "@/lib/schemas";
import { body, handler, requireUser, yearParam } from "@/server/http";
import { createKpi, kpiRegister } from "@/server/services/kpis";

/** The register for a year; the current year unless `?year=` names another. */
export const GET = handler(async (req) => {
  await requireUser("it");
  return kpiRegister(yearParam(req));
});

/** A new KPI, with its baseline, target and weight for the year: for admins, as the IT manager. */
export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  const input = await body(req, z.object({ kpi: kpiInput, settings: kpiYearInput, year: z.number().int().min(2000).max(2100) }));
  return createKpi(input.kpi, input.settings, input.year, user);
});
