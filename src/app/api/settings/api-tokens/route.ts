import { z } from "zod";
import { body, handler, requireUser } from "@/server/http";
import { createApiToken, listApiTokens } from "@/server/services/api-tokens";

export const GET = handler(async () => {
  await requireUser("settings");
  return listApiTokens();
});

/** A new key; the response is the only time it is shown. */
export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(100) }));
  return createApiToken(name, user);
});
