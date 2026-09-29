import { handler, idParam, requireUser } from "@/server/http";
import { completeJoiner } from "@/server/services/people";

export const POST = handler(async (_req, ctx: RouteContext<"/api/joiners/[id]/complete">) => {
  const user = await requireUser("it");
  return completeJoiner(await idParam(ctx), user);
});
