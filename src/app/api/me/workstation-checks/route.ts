import { handler, requireUser } from "@/server/http";
import { myWorkstationChecks } from "@/server/services/workstation-checks";

/** The signed-in person's own workstation checks. */
export const GET = handler(async () => {
  const user = await requireUser("request");
  return myWorkstationChecks(user.id);
});
