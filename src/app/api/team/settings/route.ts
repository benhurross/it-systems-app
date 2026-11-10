import { teamSettings } from "@/lib/team";
import { body, handler, requireUser } from "@/server/http";
import { getSetting, putSetting } from "@/server/settings";

/** Which emails Team Management sends: the Admins' alone. */
export const GET = handler(async () => {
  await requireUser("manager");
  return getSetting("team");
});

export const PUT = handler(async (req) => {
  const user = await requireUser("manager");
  return putSetting("team", await body(req, teamSettings), user);
});
