import { changeInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createChange, listChanges } from "@/server/services/changes";

export const GET = handler(async () => {
  await requireUser("it");
  return listChanges();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createChange(await body(req, changeInput), user);
});
