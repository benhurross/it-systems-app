import { body, handler, idParam, requireUser } from "@/server/http";
import { outletInput } from "@/lib/schemas";
import { deleteOutlet, updateOutlet } from "@/server/services/floor-plans";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/outlets/[id]">) => {
  const user = await requireUser("it");
  return updateOutlet(await idParam(ctx), await body(req, outletInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/outlets/[id]">) => {
  const user = await requireUser("it");
  return deleteOutlet(await idParam(ctx), user);
});
