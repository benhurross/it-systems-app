import { headers } from "next/headers";
import { auth, type SessionUser } from "./auth";

/** The signed-in user for this request, or null. Tests replace this module. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
