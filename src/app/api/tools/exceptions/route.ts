import { toolException } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { setException } from "@/server/services/tools";

export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  return setException(await body(req, toolException), user);
});
