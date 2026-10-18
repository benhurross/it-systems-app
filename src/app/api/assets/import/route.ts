import { badRequest, handler, requireUser } from "@/server/http";
import { importAssets } from "@/server/services/asset-import";

/** A multipart form: the Excel or CSV file, and `apply` to load it rather than only check it. */
export const POST = handler(async (req) => {
  const user = await requireUser("it");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("fileEmpty");
  return importAssets({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, form.get("apply") === "1", user);
});
