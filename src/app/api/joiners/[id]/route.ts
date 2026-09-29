import { checklistUpdate } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { updateJoinerTasks } from "@/server/services/people";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/joiners/[id]">) => {
  const user = await requireUser("it");
  return updateJoinerTasks(await idParam(ctx), await body(req, checklistUpdate), user);
});
