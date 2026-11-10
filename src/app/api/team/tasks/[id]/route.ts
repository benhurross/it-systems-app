import { teamTaskInput } from "@/lib/team";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteTask, getTask, updateTask } from "@/server/services/team";

export const GET = handler(async (_req, ctx: RouteContext<"/api/team/tasks/[id]">) => {
  const user = await requireUser("it");
  return getTask(await idParam(ctx), user);
});

export const PUT = handler(async (req, ctx: RouteContext<"/api/team/tasks/[id]">) => {
  const user = await requireUser("manager");
  return updateTask(await idParam(ctx), await body(req, teamTaskInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/team/tasks/[id]">) => {
  const user = await requireUser("manager");
  return deleteTask(await idParam(ctx), user);
});
