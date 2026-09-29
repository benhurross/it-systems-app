import { projectInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { getProject, updateProject } from "@/server/services/projects";

export const GET = handler(async (_req, ctx: RouteContext<"/api/projects/[id]">) => {
  await requireUser("it");
  return getProject(await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/projects/[id]">) => {
  const user = await requireUser("it");
  return updateProject(await idParam(ctx), await body(req, projectInput), user);
});
