import { handler, idParam, requireUser } from "@/server/http";
import { markHandedOver } from "@/server/services/id-cards";

export const POST = handler(async (_req, ctx: RouteContext<"/api/id-cards/[id]/handed-over">) => {
  const user = await requireUser("it");
  return markHandedOver(await idParam(ctx), user);
});
