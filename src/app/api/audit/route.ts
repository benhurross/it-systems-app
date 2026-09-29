import { handler, requireUser } from "@/server/http";
import { listAudit } from "@/server/services/audit-log";

export const GET = handler(async (req) => {
  await requireUser("settings");
  const params = new URL(req.url).searchParams;
  return listAudit({
    entity: params.get("entity") ?? undefined,
    userId: params.get("userId") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
});
