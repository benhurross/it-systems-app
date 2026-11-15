import { handler, requireSession } from "@/server/http";
import { endSessions } from "@/server/sessions";

/** Signs one out everywhere but here. */
export const POST = handler(async () => {
  const { user, session } = await requireSession("request");
  return { ended: await endSessions(user.id, session.id) };
});
