import { lookupInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { updateLookup } from "@/server/services/lookups";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/settings/lists/[id]">) => {
  const user = await requireUser("settings");
  return updateLookup(await idParam(ctx), await body(req, lookupInput), user);
});
