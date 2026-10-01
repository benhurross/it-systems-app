import { idCardRequest } from "@/lib/schemas";
import { badRequest, handler, requireUser } from "@/server/http";
import { myCardRequest, requestCard } from "@/server/services/id-cards";

export const GET = handler(async () => {
  const user = await requireUser("request");
  return myCardRequest(user);
});

/** A multipart form: the arranged photo, the reason and an optional note. */
export const POST = handler(async (req) => {
  const user = await requireUser("request");
  const form = await req.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File)) throw badRequest("fileEmpty");
  const fields = idCardRequest.parse({ reason: form.get("reason"), note: form.get("note") });
  return requestCard(user, { ...fields, photo: new Uint8Array(await photo.arrayBuffer()) });
});
