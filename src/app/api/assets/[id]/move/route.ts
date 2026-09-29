import { assetMove } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { moveAsset } from "@/server/services/assets";

export const POST = handler(async (req, ctx: RouteContext<"/api/assets/[id]/move">) => {
  const user = await requireUser("it");
  return moveAsset(await idParam(ctx), await body(req, assetMove), user);
});
