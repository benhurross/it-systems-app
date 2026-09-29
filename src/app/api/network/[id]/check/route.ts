import { handler, idParam, requireUser } from "@/server/http";
import { checkNow } from "@/server/services/monitoring";

export const POST = handler(async (_req, ctx: RouteContext<"/api/network/[id]/check">) => {
  await requireUser("it");
  return checkNow(await idParam(ctx));
});
