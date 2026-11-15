import { handler, requireSession } from "@/server/http";
import { endSessions, listSessions } from "@/server/sessions";
import { checkManage } from "@/server/services/users";

/** Where an account is signed in: for an Admin, any account; for an IT Admin, any but an Admin's. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/settings/users/[id]/sessions">) => {
  const { user, session } = await requireSession("settings");
  const { id } = await ctx.params;
  await checkManage(id, user);
  return listSessions(id, session.id);
});

/** Signs the account out everywhere (but here, for one's own). */
export const DELETE = handler(async (_req, ctx: RouteContext<"/api/settings/users/[id]/sessions">) => {
  const { user, session } = await requireSession("settings");
  const { id } = await ctx.params;
  await checkManage(id, user);
  return { ended: await endSessions(id, id === user.id ? session.id : undefined) };
});
