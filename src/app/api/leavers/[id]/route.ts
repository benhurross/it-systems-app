import { z } from "zod";
import { checklistUpdate } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { updateLeaver } from "@/server/services/people";

const leaverUpdate = checklistUpdate.extend({ notes: z.string().trim().max(10_000).nullish() });

export const PATCH = handler(async (req, ctx: RouteContext<"/api/leavers/[id]">) => {
  const user = await requireUser("it");
  return updateLeaver(await idParam(ctx), await body(req, leaverUpdate), user);
});
