import { purchaseStatus } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { setPurchaseStatus } from "@/server/services/finance";

export const POST = handler(async (req, ctx: RouteContext<"/api/purchases/[id]/status">) => {
  const user = await requireUser("it");
  return setPurchaseStatus(await idParam(ctx), await body(req, purchaseStatus), user);
});
