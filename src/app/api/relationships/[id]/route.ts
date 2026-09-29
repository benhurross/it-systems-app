import { handler, idParam, requireUser } from "@/server/http";
import { deleteRelationship } from "@/server/services/assets";

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/relationships/[id]">) => {
  const user = await requireUser("it");
  return deleteRelationship(await idParam(ctx), user);
});
