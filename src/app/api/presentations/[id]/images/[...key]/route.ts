import { handler, idParam, notFound, requireUser } from "@/server/http";
import { presentationImage } from "@/server/services/presentations";
import { fileResponse } from "../../../respond";

/** A picture of the presentation's, by its key ("2026-10/…", so two segments). */
export const GET = handler(async (_req, ctx: RouteContext<"/api/presentations/[id]/images/[...key]">) => {
  const user = await requireUser("request");
  const key = (await ctx.params).key.join("/");
  if (!/^\d{4}-\d{2}\/[0-9a-f-]{36}$/.test(key)) throw notFound();
  // A picture's key never changes what it holds.
  return fileResponse(await presentationImage(user, await idParam(ctx), key), { cache: "private, max-age=31536000, immutable" });
});
