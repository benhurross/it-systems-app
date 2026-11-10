import { handler, requireUser } from "@/server/http";
import { listAssignees } from "@/server/services/team";

/** The IT team's accounts, to give a task to. */
export const GET = handler(async () => {
  await requireUser("manager");
  return listAssignees();
});
