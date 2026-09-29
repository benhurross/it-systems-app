import { vendorInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createVendor, listVendors } from "@/server/services/finance";

export const GET = handler(async () => {
  await requireUser("it");
  return listVendors();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createVendor(await body(req, vendorInput), user);
});
