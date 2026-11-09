import { z } from "zod";
import { body, handler, idParam, requireUser } from "@/server/http";
import { clearBeyondRepair, markBeyondRepair } from "@/server/services/assets";

/** IT confirms the asset cannot be repaired, saying why: it is then due for replacement. */
export const POST = handler(async (req, ctx: RouteContext<"/api/assets/[id]/beyond-repair">) => {
  const user = await requireUser("it");
  const { reason } = await body(req, z.object({ reason: z.string().trim().min(3).max(500) }));
  return markBeyondRepair(await idParam(ctx), reason, user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/assets/[id]/beyond-repair">) => {
  const user = await requireUser("it");
  return clearBeyondRepair(await idParam(ctx), user);
});
