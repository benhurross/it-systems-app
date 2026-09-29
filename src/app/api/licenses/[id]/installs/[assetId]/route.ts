import { handler, idParam, notFound, requireUser } from "@/server/http";
import { removeInstall } from "@/server/services/licenses";

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/licenses/[id]/installs/[assetId]">) => {
  const user = await requireUser("it");
  const assetId = Number((await ctx.params).assetId);
  if (!Number.isInteger(assetId) || assetId <= 0) throw notFound();
  return removeInstall(await idParam(ctx), assetId, user);
});
