import { assetInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteAsset, getAsset, updateAsset } from "@/server/services/assets";

export const GET = handler(async (_req, ctx: RouteContext<"/api/assets/[id]">) => {
  await requireUser("it");
  return getAsset(await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/assets/[id]">) => {
  const user = await requireUser("it");
  return updateAsset(await idParam(ctx), await body(req, assetInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/assets/[id]">) => {
  const user = await requireUser("it");
  return deleteAsset(await idParam(ctx), user);
});
