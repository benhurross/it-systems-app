import { body, handler, requireUser } from "@/server/http";
import { userCreate } from "@/lib/schemas";
import { createUser, listUsers } from "@/server/services/users";

export const GET = handler(async () => {
  const user = await requireUser("settings");
  return listUsers(user);
});

export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  return createUser(await body(req, userCreate), user);
});
