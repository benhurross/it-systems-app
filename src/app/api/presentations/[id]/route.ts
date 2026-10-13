import { presentationUpdate } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deletePresentation, getPresentation, updatePresentation } from "@/server/services/presentations";

export const GET = handler(async (_req, ctx: RouteContext<"/api/presentations/[id]">) => {
  const user = await requireUser("request");
  return getPresentation(user, await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/presentations/[id]">) => {
  const user = await requireUser("request");
  return updatePresentation(user, await idParam(ctx), await body(req, presentationUpdate));
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/presentations/[id]">) => {
  const user = await requireUser("request");
  return deletePresentation(user, await idParam(ctx));
});
