import { z } from "zod";
import { body, handler, requireUser } from "@/server/http";
import { deleteLeavers } from "@/server/services/people";

const leaversDelete = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
  /** Make those whose completed offboarding marked them as having left current again. */
  restore: z.boolean().default(false),
});

/** Deletes offboarding records, one or many at once: Admins only. */
export const POST = handler(async (req) => {
  const user = await requireUser("manager");
  const { ids, restore } = await body(req, leaversDelete);
  return deleteLeavers(ids, restore, user);
});
