import { lookupInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createLookup, listLookups } from "@/server/services/lookups";

export const GET = handler(async () => {
  await requireUser("settings");
  return listLookups({ includeInactive: true });
});

export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  return createLookup(await body(req, lookupInput), user);
});
