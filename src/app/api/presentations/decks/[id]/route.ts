import { deckUpdate } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteDeck, updateDeck } from "@/server/services/presentations";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/presentations/decks/[id]">) => {
  const user = await requireUser("settings");
  return updateDeck(await idParam(ctx), await body(req, deckUpdate), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/presentations/decks/[id]">) => {
  const user = await requireUser("settings");
  return deleteDeck(await idParam(ctx), user);
});
