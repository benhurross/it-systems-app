import { commentCreate } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { addComment } from "@/server/services/tickets";

export const POST = handler(async (req, ctx: RouteContext<"/api/tickets/[id]/comments">) => {
  const user = await requireUser("request");
  return addComment(user, await idParam(ctx), await body(req, commentCreate));
});
