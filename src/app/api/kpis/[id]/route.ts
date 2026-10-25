import { kpiInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteKpi, updateKpi } from "@/server/services/kpis";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/kpis/[id]">) => {
  const user = await requireUser("settings");
  return updateKpi(await idParam(ctx), await body(req, kpiInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/kpis/[id]">) => {
  const user = await requireUser("settings");
  return deleteKpi(await idParam(ctx), user);
});
