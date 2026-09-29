import { handler, requireUser } from "@/server/http";
import { listLookups } from "@/server/services/lookups";

/** Active reference lists, for every form in the app. */
export const GET = handler(async () => {
  await requireUser("request");
  return listLookups();
});
