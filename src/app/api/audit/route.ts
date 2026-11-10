import { handler, requireUser } from "@/server/http";
import { listAudit } from "@/server/services/audit-log";

export const GET = handler(async (req) => {
  // The audit log is the Admins' alone: IT Admins do not see what anyone, Admins included, did.
  await requireUser("manager");
  const params = new URL(req.url).searchParams;
  return listAudit({
    entity: params.get("entity") ?? undefined,
    userId: params.get("userId") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
});
