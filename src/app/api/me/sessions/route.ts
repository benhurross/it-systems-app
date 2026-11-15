import { handler, requireSession } from "@/server/http";
import { listSessions } from "@/server/sessions";

/** Where one is signed in, this one marked. */
export const GET = handler(async () => {
  const { user, session } = await requireSession("request");
  return listSessions(user.id, session.id);
});
