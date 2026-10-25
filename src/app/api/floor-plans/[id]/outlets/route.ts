import { body, handler, idParam, requireUser } from "@/server/http";
import { outletInput } from "@/lib/schemas";
import { createOutlet } from "@/server/services/floor-plans";

export const POST = handler(async (req, ctx: RouteContext<"/api/floor-plans/[id]/outlets">) => {
  const user = await requireUser("it");
  return createOutlet(await idParam(ctx), await body(req, outletInput), user);
});
