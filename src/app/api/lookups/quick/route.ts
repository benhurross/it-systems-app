import { z } from "zod";
import { body, handler, requireUser } from "@/server/http";
import { addLookupValue, QUICK_LISTS } from "@/server/services/lookups";

/** A value IT typed in one of the asset form's dropdowns, added to its list: { list, label }. */
export const POST = handler(async (req) => {
  const user = await requireUser("it");
  const { list, label } = await body(req, z.object({ list: z.enum(QUICK_LISTS), label: z.string().trim().min(1).max(100) }));
  return addLookupValue(list, label, user);
});
