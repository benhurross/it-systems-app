import { handler, idParam, requireUser } from "@/server/http";
import { deleteWorkstationCheck, getWorkstationCheck } from "@/server/services/workstation-checks";

export const GET = handler(async (_req, ctx: RouteContext<"/api/workstation-checks/[id]">) => {
  await requireUser("it");
  return getWorkstationCheck(await idParam(ctx));
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/workstation-checks/[id]">) => {
  const user = await requireUser("it");
  return deleteWorkstationCheck(await idParam(ctx), user);
});
