import { changeInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { getChange, updateChange } from "@/server/services/changes";

export const GET = handler(async (_req, ctx: RouteContext<"/api/changes/[id]">) => {
  await requireUser("it");
  return getChange(await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/changes/[id]">) => {
  const user = await requireUser("it");
  return updateChange(await idParam(ctx), await body(req, changeInput), user);
});
