import { badRequest, handler, idParam, requireUser } from "@/server/http";
import { cardPhoto, setCardPhoto } from "@/server/services/id-cards";
import { imageResponse } from "../../image-response";

export const GET = handler(async (_req, ctx: RouteContext<"/api/id-cards/[id]/photo">) => {
  await requireUser("it");
  return imageResponse(await cardPhoto(await idParam(ctx)), "private, no-store");
});

/** A multipart form with the photo, already arranged for the photo window. */
export const PUT = handler(async (req, ctx: RouteContext<"/api/id-cards/[id]/photo">) => {
  const user = await requireUser("it");
  const photo = (await req.formData()).get("photo");
  if (!(photo instanceof File)) throw badRequest("fileEmpty");
  return setCardPhoto(await idParam(ctx), new Uint8Array(await photo.arrayBuffer()), user);
});
