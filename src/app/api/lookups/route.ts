import { handler, requireUser } from "@/server/http";
import { listLookups } from "@/server/services/lookups";

/** Every reference value, active or not: old records still need their labels. Forms offer only active ones. */
export const GET = handler(async () => {
  await requireUser("request");
  return listLookups({ includeInactive: true });
});
