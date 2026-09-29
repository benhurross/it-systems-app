import { taskInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { createTask } from "@/server/services/projects";

export const POST = handler(async (req, ctx: RouteContext<"/api/projects/[id]/tasks">) => {
  const user = await requireUser("it");
  return createTask(await idParam(ctx), await body(req, taskInput), user);
});
