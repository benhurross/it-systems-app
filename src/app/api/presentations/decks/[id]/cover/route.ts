import { handler, idParam, requireUser } from "@/server/http";
import { deckFile, setCoverImage } from "@/server/services/presentations";
import { fileResponse, requiredFile, versioned } from "../../../respond";

export const GET = handler(async (req, ctx: RouteContext<"/api/presentations/decks/[id]/cover">) => {
  const user = await requireUser("request");
  const { bytes, type } = await deckFile(user, await idParam(ctx), "cover");
  return fileResponse({ bytes, type }, { cache: versioned(req) });
});

/** A multipart form with the picture. */
export const PUT = handler(async (req, ctx: RouteContext<"/api/presentations/decks/[id]/cover">) => {
  const user = await requireUser("settings");
  const file = await requiredFile(await req.formData(), "file");
  return setCoverImage(await idParam(ctx), file.bytes, user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/presentations/decks/[id]/cover">) => {
  const user = await requireUser("settings");
  return setCoverImage(await idParam(ctx), null, user);
});
