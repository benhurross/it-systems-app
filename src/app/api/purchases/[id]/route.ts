import { purchaseInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { updatePurchase } from "@/server/services/finance";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/purchases/[id]">) => {
  const user = await requireUser("it");
  return updatePurchase(await idParam(ctx), await body(req, purchaseInput), user);
});
