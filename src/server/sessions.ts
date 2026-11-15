import { and, desc, eq, ne } from "drizzle-orm";
import { describeDevice, type SecuritySettings } from "@/lib/security";
import { db } from "./db";
import { sessions } from "./db/schema";
import { getSetting } from "./settings";

/**
 * Where an account is signed in, and the rules on it: signing out after so many minutes without
 * activity, and one sign-in at a time. The end-to-end suite, which keeps one sign-in per role for
 * the whole run and signs the same accounts in from many places, turns the rules off with
 * SESSION_RULES=off; nothing else should.
 */

export const rulesApply = () => process.env.SESSION_RULES !== "off";

// The rules are read often (each request) and change rarely: kept for half a minute.
let kept: { value: SecuritySettings; at: number } | null = null;
export async function securityRules(): Promise<SecuritySettings> {
  if (kept && Date.now() - kept.at < 30_000) return kept.value;
  kept = { value: await getSetting("security"), at: Date.now() };
  return kept.value;
}
/** After the rules are changed, so they apply at once. */
export const forgetRules = () => {
  kept = null;
};

/** A minute more than the limit, for the browser's last report of activity to arrive. */
const GRACE_MS = 60_000;

/** Whether a sign-in has been idle past the limit. One never reported active counts from when it began. */
export function idleTooLong(session: { lastActiveAt?: Date | string | null; createdAt: Date | string }, idleMinutes: number, now = new Date()) {
  if (!idleMinutes) return false;
  const last = new Date(session.lastActiveAt ?? session.createdAt).getTime();
  return now.getTime() - last > idleMinutes * 60_000 + GRACE_MS;
}

/** The person did something: their sign-in is active now. */
export async function touchSession(id: string, now = new Date()) {
  await db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.id, id));
}

/** An account's sign-ins, newest activity first, the one asking marked. */
export async function listSessions(userId: string, currentId?: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.lastActiveAt), desc(sessions.createdAt));
  return rows
    .filter((s) => s.expiresAt > new Date())
    .map((s) => ({
      id: s.id,
      ...describeDevice(s.userAgent),
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt ?? s.createdAt,
      current: s.id === currentId,
    }));
}

/** Ends one of an account's sign-ins. */
export async function endSession(userId: string, id: string) {
  const ended = await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, id))).returning({ id: sessions.id });
  return ended.length;
}

/** Ends an account's sign-ins everywhere, or everywhere but the one given. */
export async function endSessions(userId: string, except?: string) {
  const ended = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), except ? ne(sessions.id, except) : undefined))
    .returning({ id: sessions.id });
  return ended.length;
}
