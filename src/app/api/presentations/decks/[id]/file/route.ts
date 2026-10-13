import { handler, idParam, requireUser } from "@/server/http";
import { deckFile, replaceDeckFile } from "@/server/services/presentations";
import { fileResponse, formFile, requiredFile } from "../../../respond";

/** The deck's PowerPoint file as uploaded. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/presentations/decks/[id]/file">) => {
  const user = await requireUser("settings");
  return fileResponse(await deckFile(user, await idParam(ctx), "pptx"));
});

/** A multipart form with a newer version of the file, optionally with a PDF of it. */
export const PUT = handler(async (req, ctx: RouteContext<"/api/presentations/decks/[id]/file">) => {
  const user = await requireUser("settings");
  const form = await req.formData();
  const file = await requiredFile(form, "file");
  const preview = await formFile(form, "preview");
  return replaceDeckFile(await idParam(ctx), { file, preview: preview?.bytes ?? null }, user);
});
