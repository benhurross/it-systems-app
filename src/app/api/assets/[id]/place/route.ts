import { assetPlace } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { placeAsset, unplaceAsset } from "@/server/services/floor-plans";

/** Puts the asset on a floor plan, at a spot: { planId, x, y } in fractions of the plan. */
export const POST = handler(async (req, ctx: RouteContext<"/api/assets/[id]/place">) => {
  const user = await requireUser("it");
  return placeAsset(await idParam(ctx), await body(req, assetPlace), user);
});

/** Takes the asset off the floor plans; its room stays as written. */
export const DELETE = handler(async (_req, ctx: RouteContext<"/api/assets/[id]/place">) => {
  const user = await requireUser("it");
  return unplaceAsset(await idParam(ctx), user);
});
