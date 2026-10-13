import { handler, idParam, requireUser } from "@/server/http";
import { addPresentationImage } from "@/server/services/presentations";
import { requiredFile } from "../../respond";

/** A multipart form with the picture. */
export const POST = handler(async (req, ctx: RouteContext<"/api/presentations/[id]/images">) => {
  const user = await requireUser("request");
  const file = await requiredFile(await req.formData(), "file");
  return addPresentationImage(user, await idParam(ctx), file.bytes);
});
