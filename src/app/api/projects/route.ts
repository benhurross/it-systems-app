import { projectInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createProject, listProjects } from "@/server/services/projects";

export const GET = handler(async () => {
  await requireUser("it");
  return listProjects();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createProject(await body(req, projectInput), user);
});
