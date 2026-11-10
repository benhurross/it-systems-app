import { handler, requireUser } from "@/server/http";
import { teamDashboard } from "@/server/services/team-plans";

/** The team's figures and workload: the Admins' alone. */
export const GET = handler(async () => {
  await requireUser("manager");
  return teamDashboard();
});
