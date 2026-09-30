import { attachmentOwner, attachmentUpload } from "@/lib/schemas";
import { badRequest, handler, requireUser } from "@/server/http";
import { addAttachment, listAttachments } from "@/server/services/attachments";

export const GET = handler(async (req) => {
  await requireUser("it");
  const { entity, id } = attachmentOwner.parse(Object.fromEntries(new URL(req.url).searchParams));
  return listAttachments(entity, id);
});

/** A multipart form: the file, plus which record it belongs to and what kind of document it is. */
export const POST = handler(async (req) => {
  const user = await requireUser("it");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("fileEmpty");
  const fields = attachmentUpload.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  return addAttachment({ ...fields, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, user);
});
