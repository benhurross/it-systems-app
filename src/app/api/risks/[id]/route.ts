import { riskInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteRisk, updateRisk } from "@/server/services/risk";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/risks/[id]">) => {
  const user = await requireUser("it");
  return updateRisk(await idParam(ctx), await body(req, riskInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/risks/[id]">) => {
  const user = await requireUser("it");
  return deleteRisk(await idParam(ctx), user);
});
