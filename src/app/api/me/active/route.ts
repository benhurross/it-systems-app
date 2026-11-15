import { handler, requireSession } from "@/server/http";
import { rulesApply, securityRules, touchSession } from "@/server/sessions";

/**
 * The person did something (typed, clicked, scrolled): their sign-in is active now. Sent by the
 * page at most once a minute, and only after real activity; pages refreshing themselves never send
 * it. Answers how long without activity before signing out (0: never).
 */
export const POST = handler(async () => {
  const { session } = await requireSession("request");
  await touchSession(session.id);
  return { idleMinutes: rulesApply() ? (await securityRules()).idleMinutes : 0 };
});
