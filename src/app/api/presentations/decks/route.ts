import { deckUpload } from "@/lib/schemas";
import { handler, requireUser } from "@/server/http";
import { addDeck, listDecks } from "@/server/services/presentations";
import { formFile, requiredFile } from "../respond";

export const GET = handler(async () => {
  const user = await requireUser("request");
  return listDecks(user);
});

/** A multipart form: the PowerPoint file, optionally a PDF of it, its name and its category. */
export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  const form = await req.formData();
  const fields = deckUpload.parse({ name: form.get("name"), category: form.get("category") });
  const file = await requiredFile(form, "file");
  const preview = await formFile(form, "preview");
  return addDeck({ ...fields, file, preview: preview?.bytes ?? null }, user);
});
