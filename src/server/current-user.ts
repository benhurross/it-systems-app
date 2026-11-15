import { headers } from "next/headers";
import { auth, type SessionUser } from "./auth";
import { endSession, idleTooLong, rulesApply, securityRules } from "./sessions";

/**
 * This request's sign-in and its user, or null. A sign-in idle longer than Settings allow is ended
 * here, whatever the browser does: a page left refreshing itself does not keep it alive.
 */
export async function currentSession() {
  const found = await auth.api.getSession({ headers: await headers() });
  if (!found) return null;
  if (rulesApply()) {
    const { idleMinutes } = await securityRules();
    if (idleTooLong(found.session, idleMinutes)) {
      await endSession(found.user.id, found.session.id);
      return null;
    }
  }
  return found;
}

/** The signed-in user for this request, or null. Tests replace this module. */
export async function currentUser(): Promise<SessionUser | null> {
  return (await currentSession())?.user ?? null;
}
