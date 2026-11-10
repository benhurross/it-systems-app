import { can } from "@/lib/permissions";
import { handler, requireUser } from "@/server/http";
import { listOutbox } from "@/server/mail/outbox";

export const GET = handler(async () => {
  const user = await requireUser("settings");
  return listOutbox({ team: can(user.role, "manager") });
});
