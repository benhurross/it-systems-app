import { z } from "zod";
import { body, handler, idParam, requireUser } from "@/server/http";
import { duplicatePresentation } from "@/server/services/presentations";

/** What the copy's title ends with, in the person's language: "(copy)". */
const copy = z.object({ label: z.string().trim().min(1).max(30) });

export const POST = handler(async (req, ctx: RouteContext<"/api/presentations/[id]/duplicate">) => {
  const user = await requireUser("request");
  return duplicatePresentation(user, await idParam(ctx), (await body(req, copy)).label);
});
