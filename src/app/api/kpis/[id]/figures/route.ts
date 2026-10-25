import { kpiFigureInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { setKpiFigure } from "@/server/services/kpis";

/** A month's or quarter's figure, as IT staff record it. */
export const PUT = handler(async (req, ctx: RouteContext<"/api/kpis/[id]/figures">) => {
  const user = await requireUser("it");
  await setKpiFigure(await idParam(ctx), await body(req, kpiFigureInput), user);
  return { ok: true };
});
