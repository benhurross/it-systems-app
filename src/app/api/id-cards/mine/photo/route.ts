import { handler, requireUser } from "@/server/http";
import { myCardPhoto } from "@/server/services/id-cards";
import { imageResponse } from "../../image-response";

export const GET = handler(async () => {
  const user = await requireUser("request");
  return imageResponse(await myCardPhoto(user), "private, no-store");
});
