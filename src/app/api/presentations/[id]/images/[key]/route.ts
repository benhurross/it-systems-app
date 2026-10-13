import { handler, idParam, notFound, requireUser } from "@/server/http";
import { presentationImage } from "@/server/services/presentations";
import { fileResponse } from "../../../respond";

export const GET = handler(async (_req, ctx: RouteContext<"/api/presentations/[id]/images/[key]">) => {
  const user = await requireUser("request");
  const key = decodeURIComponent((await ctx.params).key);
  if (!/^\d{4}-\d{2}\/[0-9a-f-]{36}$/.test(key)) throw notFound();
  // A picture's key never changes what it holds.
  return fileResponse(await presentationImage(user, await idParam(ctx), key), { cache: "private, max-age=31536000, immutable" });
});
