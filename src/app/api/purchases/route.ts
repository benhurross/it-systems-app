import { purchaseInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createPurchase, listPurchases } from "@/server/services/finance";

export const GET = handler(async () => {
  await requireUser("it");
  return listPurchases();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createPurchase(await body(req, purchaseInput), user);
});
