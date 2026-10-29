import { vendorInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteVendor, updateVendor } from "@/server/services/finance";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/vendors/[id]">) => {
  const user = await requireUser("it");
  return updateVendor(await idParam(ctx), await body(req, vendorInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/vendors/[id]">) => {
  const user = await requireUser("it");
  return deleteVendor(await idParam(ctx), user);
});
