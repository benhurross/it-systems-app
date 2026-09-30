import { handler, requireUser } from "@/server/http";
import { listOutbox } from "@/server/mail/outbox";

export const GET = handler(async () => {
  await requireUser("settings");
  return listOutbox();
});
