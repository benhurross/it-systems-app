import { z } from "zod";
import { kpiYearInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { setKpiYear } from "@/server/services/kpis";

/** A KPI's baseline, target and weight for a year. */
export const PUT = handler(async (req, ctx: RouteContext<"/api/kpis/[id]/years/[year]">) => {
  const user = await requireUser("settings");
  const year = z.coerce.number().int().min(2000).max(2100).parse((await ctx.params).year);
  await setKpiYear(await idParam(ctx), year, await body(req, kpiYearInput), user);
  return { ok: true };
});
