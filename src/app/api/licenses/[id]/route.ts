import { licenseInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteLicense, getLicense, updateLicense } from "@/server/services/licenses";

export const GET = handler(async (_req, ctx: RouteContext<"/api/licenses/[id]">) => {
  await requireUser("it");
  return getLicense(await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/licenses/[id]">) => {
  const user = await requireUser("it");
  return updateLicense(await idParam(ctx), await body(req, licenseInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/licenses/[id]">) => {
  const user = await requireUser("it");
  return deleteLicense(await idParam(ctx), user);
});
