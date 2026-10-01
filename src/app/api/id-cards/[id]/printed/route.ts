import { handler, idParam, requireUser } from "@/server/http";
import { markPrinted } from "@/server/services/id-cards";

export const POST = handler(async (_req, ctx: RouteContext<"/api/id-cards/[id]/printed">) => {
  const user = await requireUser("it");
  return markPrinted(await idParam(ctx), user);
});
