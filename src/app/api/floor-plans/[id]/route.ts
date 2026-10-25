import { body, handler, idParam, requireUser } from "@/server/http";
import { floorPlanInput } from "@/lib/schemas";
import { deletePlan, getPlan, updatePlan } from "@/server/services/floor-plans";

export const GET = handler(async (_req, ctx: RouteContext<"/api/floor-plans/[id]">) => {
  await requireUser("it");
  return getPlan(await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/floor-plans/[id]">) => {
  const user = await requireUser("it");
  return updatePlan(await idParam(ctx), await body(req, floorPlanInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/floor-plans/[id]">) => {
  const user = await requireUser("it");
  return deletePlan(await idParam(ctx), user);
});
