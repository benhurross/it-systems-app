import { handler, idParam, requireUser } from "@/server/http";
import { getDiscoveryRun } from "@/server/services/discovery";

export const GET = handler(async (_req, ctx: RouteContext<"/api/discovery/[id]">) => {
  await requireUser("it");
  return getDiscoveryRun(await idParam(ctx));
});
