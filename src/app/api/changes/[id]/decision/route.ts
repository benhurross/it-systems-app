import { changeDecision } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { decideChange } from "@/server/services/changes";

export const POST = handler(async (req, ctx: RouteContext<"/api/changes/[id]/decision">) => {
  const user = await requireUser("it");
  return decideChange(await idParam(ctx), await body(req, changeDecision), user);
});
