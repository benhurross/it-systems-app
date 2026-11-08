import { handler, requireUser } from "@/server/http";
import { workstationChecklist } from "@/server/services/workstation-checks";

/** The items a check goes through, as Settings → Lists has them. */
export const GET = handler(async () => {
  await requireUser("it");
  return workstationChecklist();
});
