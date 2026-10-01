import { toolDecision } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { decideRequest } from "@/server/services/tools";

export const POST = handler(async (req, ctx: RouteContext<"/api/tools/exceptions/[id]/decide">) => {
  const user = await requireUser("settings");
  const { grant } = await body(req, toolDecision);
  return decideRequest(await idParam(ctx), grant, user);
});
