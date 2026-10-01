import { handler, idParam, requireUser } from "@/server/http";
import { removeException } from "@/server/services/tools";

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/tools/exceptions/[id]">) => {
  const user = await requireUser("settings");
  return removeException(await idParam(ctx), user);
});
