import { planInput } from "@/lib/team";
import { badRequest, body, handler, requireUser } from "@/server/http";
import { createPlan, listPlans } from "@/server/services/team-plans";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Plan entries between ?from= and ?to=: the Admins see the team's, anyone else in IT their own. */
export const GET = handler(async (req) => {
  const user = await requireUser("it");
  const params = new URL(req.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!DAY.test(from) || !DAY.test(to)) throw badRequest("from and to are needed, as YYYY-MM-DD");
  return listPlans(user, { from, to });
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createPlan(await body(req, planInput), user);
});
