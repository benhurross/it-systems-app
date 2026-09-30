import { emailSettings } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { getEmailSettings, putEmailSettings } from "@/server/mail/config";

export const GET = handler(async () => {
  await requireUser("settings");
  return getEmailSettings();
});

export const PUT = handler(async (req) => {
  const user = await requireUser("settings");
  return putEmailSettings(await body(req, emailSettings), user);
});
