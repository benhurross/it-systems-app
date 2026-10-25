import { handler, idParam, requireUser } from "@/server/http";
import { revokeApiToken } from "@/server/services/api-tokens";

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/settings/api-tokens/[id]">) => {
  const user = await requireUser("settings");
  return revokeApiToken(await idParam(ctx), user);
});
