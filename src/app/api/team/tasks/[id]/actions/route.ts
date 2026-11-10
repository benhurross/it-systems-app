import { taskAction } from "@/lib/team";
import { body, handler, idParam, requireUser } from "@/server/http";
import { actOnTask } from "@/server/services/team";

/** Start, progress, comment, done, move; and, for the Admins, confirm, send back, reopen, note. */
export const POST = handler(async (req, ctx: RouteContext<"/api/team/tasks/[id]/actions">) => {
  const user = await requireUser("it");
  return actOnTask(await idParam(ctx), await body(req, taskAction), user);
});
