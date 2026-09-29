import { body, handler, requireUser } from "@/server/http";
import { userUpdate } from "@/lib/schemas";
import { updateUser } from "@/server/services/users";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/settings/users/[id]">) => {
  const user = await requireUser("settings");
  return updateUser((await ctx.params).id, await body(req, userUpdate), user);
});
