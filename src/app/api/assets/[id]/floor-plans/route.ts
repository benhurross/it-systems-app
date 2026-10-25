import { handler, idParam, requireUser } from "@/server/http";
import { assetOnPlans } from "@/server/services/floor-plans";

/** The wall ports an asset is plugged into, and the plans where it is a switch. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/assets/[id]/floor-plans">) => {
  await requireUser("it");
  return assetOnPlans(await idParam(ctx));
});
