import { z } from "zod";
import { quarterOf } from "@/lib/kpis";
import { kpiActualsInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { kpis, setKpiActuals } from "@/server/services/kpis";

/** The year's KPIs; the current year unless `?year=` names another. */
export const GET = handler(async (req) => {
  await requireUser("it");
  const year = new URL(req.url).searchParams.get("year");
  return kpis(year ? z.coerce.number().int().min(2000).max(2100).parse(year) : quarterOf(new Date()).year);
});

/** Training hours or ISO non-conformities for each quarter of a year, as entered by IT staff. */
export const PUT = handler(async (req) => {
  const user = await requireUser("it");
  const input = await body(req, kpiActualsInput);
  await setKpiActuals(input, user);
  return kpis(input.year);
});
