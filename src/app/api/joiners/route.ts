import { joinerInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createJoiner, listJoiners } from "@/server/services/people";

export const GET = handler(async () => {
  await requireUser("it");
  return listJoiners();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createJoiner(await body(req, joinerInput), user);
});
