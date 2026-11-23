import { z } from "zod";
import { body, handler, requireUser } from "@/server/http";
import { deleteJoiners } from "@/server/services/people";

const joinersDelete = z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000) });

/** Deletes onboarding records, one or many at once: Admins only. */
export const POST = handler(async (req) => {
  const user = await requireUser("manager");
  return deleteJoiners((await body(req, joinersDelete)).ids, user);
});
