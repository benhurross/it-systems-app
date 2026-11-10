import { teamTaskInput } from "@/lib/team";
import { body, handler, requireUser } from "@/server/http";
import { createTask, listTasks } from "@/server/services/team";

/** The Admins: every task; anyone else in IT: the tasks given to them (My work). */
export const GET = handler(async () => {
  const user = await requireUser("it");
  return listTasks(user);
});

/** A task, given by an Admin. */
export const POST = handler(async (req) => {
  const user = await requireUser("manager");
  return createTask(await body(req, teamTaskInput), user);
});
