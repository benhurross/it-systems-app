import { handler, idParam, requireUser } from "@/server/http";
import { readMyWorkstationCheck } from "@/server/services/workstation-checks";

/** "I've read it", in the app, for one of the person's own checks. */
export const POST = handler(async (_req, ctx: RouteContext<"/api/me/workstation-checks/[id]/read">) => {
  const user = await requireUser("request");
  return readMyWorkstationCheck(await idParam(ctx), user);
});
