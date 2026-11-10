import { planInput } from "@/lib/team";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deletePlan, updatePlan } from "@/server/services/team-plans";

/** One's own plan entry only. */
export const PUT = handler(async (req, ctx: RouteContext<"/api/team/plans/[id]">) => {
  const user = await requireUser("it");
  return updatePlan(await idParam(ctx), await body(req, planInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/team/plans/[id]">) => {
  const user = await requireUser("it");
  return deletePlan(await idParam(ctx), user);
});
