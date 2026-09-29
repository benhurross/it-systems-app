import { handler, idParam, requireUser } from "@/server/http";
import { alertTicket } from "@/server/services/monitoring";

export const POST = handler(async (_req, ctx: RouteContext<"/api/alerts/[id]/ticket">) => {
  const user = await requireUser("it");
  return alertTicket(await idParam(ctx), user);
});
