import { emailTestInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { sendTest } from "@/server/mail/outbox";
import { testEmail } from "@/server/mail/templates";

export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  const { to } = await body(req, emailTestInput);
  return sendTest(to, testEmail(user.name));
});
