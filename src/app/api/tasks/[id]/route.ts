import { taskInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteTask, updateTask } from "@/server/services/projects";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/tasks/[id]">) => {
  const user = await requireUser("it");
  return updateTask(await idParam(ctx), await body(req, taskInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/tasks/[id]">) => {
  const user = await requireUser("it");
  return deleteTask(await idParam(ctx), user);
});
