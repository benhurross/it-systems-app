import { handler, idParam, requireUser } from "@/server/http";
import { acknowledgeAlert } from "@/server/services/monitoring";

export const POST = handler(async (_req, ctx: RouteContext<"/api/alerts/[id]/acknowledge">) => {
  const user = await requireUser("it");
  return acknowledgeAlert(await idParam(ctx), user);
});
