import { handler, notFound, requireSession } from "@/server/http";
import { endSession } from "@/server/sessions";

/** Ends one of one's own sign-ins (this one too, which is signing out). */
export const DELETE = handler(async (_req, ctx: RouteContext<"/api/me/sessions/[id]">) => {
  const { user } = await requireSession("request");
  const { id } = await ctx.params;
  if (!(await endSession(user.id, id))) throw notFound();
  return { id };
});
