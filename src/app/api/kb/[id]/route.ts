import { kbArticle } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { getArticle, updateArticle } from "@/server/services/kb";

export const GET = handler(async (_req, ctx: RouteContext<"/api/kb/[id]">) => {
  const user = await requireUser("request");
  return getArticle(user, await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/kb/[id]">) => {
  const user = await requireUser("it");
  return updateArticle(user, await idParam(ctx), await body(req, kbArticle));
});
