import { can } from "@/lib/permissions";
import { handler, idParam, requireUser } from "@/server/http";
import { getEmail } from "@/server/mail/outbox";

export const GET = handler(async (_req, ctx: RouteContext<"/api/settings/email/outbox/[id]">) => {
  const user = await requireUser("settings");
  return getEmail(await idParam(ctx), { team: can(user.role, "manager") });
});
