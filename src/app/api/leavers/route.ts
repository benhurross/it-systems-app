import { leaverInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createLeaver, listLeavers } from "@/server/services/people";

export const GET = handler(async () => {
  await requireUser("it");
  return listLeavers();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createLeaver(await body(req, leaverInput), user);
});
