import { idCardUpdate } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteCard, getCard, updateCard } from "@/server/services/id-cards";

export const GET = handler(async (_req, ctx: RouteContext<"/api/id-cards/[id]">) => {
  await requireUser("it");
  return getCard(await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/id-cards/[id]">) => {
  const user = await requireUser("it");
  return updateCard(await idParam(ctx), await body(req, idCardUpdate), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/id-cards/[id]">) => {
  const user = await requireUser("it");
  return deleteCard(await idParam(ctx), user);
});
