import { handler, idParam, requireUser } from "@/server/http";
import { deckFile } from "@/server/services/presentations";
import { fileResponse, versioned } from "../../../respond";

/** The deck as a PDF, a page a slide, for the slide pictures. Pages ask with ?v= the deck's version. */
export const GET = handler(async (req, ctx: RouteContext<"/api/presentations/decks/[id]/preview">) => {
  const user = await requireUser("request");
  return fileResponse(await deckFile(user, await idParam(ctx), "preview"), { inline: true, cache: versioned(req) });
});
