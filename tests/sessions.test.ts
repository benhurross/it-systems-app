import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { userUpdate } from "@/lib/schemas";
import { describeDevice } from "@/lib/security";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { auth } = await import("@/server/auth");
const { seedDemo, DEMO_PASSWORD } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const sessions = await import("@/server/sessions");
const { putSetting } = await import("@/server/settings");
const { updateUser, checkManage } = await import("@/server/services/users");

let admin: Awaited<ReturnType<typeof asUser>>;
beforeAll(async () => {
  await seedDemo(NOW);
  admin = await asUser("admin@applus.test");
}, 120_000);

const signIn = async (email: string) => {
  const res = await auth.api.signInEmail({ body: { email, password: DEMO_PASSWORD }, headers: new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0" }) });
  return res.token;
};
const sessionsOf = (userId: string) => db.select().from(s.sessions).where(eq(s.sessions.userId, userId));
const rules = async (singleSession: boolean, idleMinutes: 0 | 5 = 5) => {
  await putSetting("security", { singleSession, idleMinutes }, admin);
  sessions.forgetRules();
};

describe("sign-in rules", () => {
  it("sign an account out after the minutes without activity, counting from its last activity", () => {
    const at = new Date("2026-11-15T10:00:00Z");
    const after = (minutes: number) => new Date(at.getTime() + minutes * 60_000);
    // A minute's grace for the browser's last report.
    expect(sessions.idleTooLong({ lastActiveAt: at, createdAt: at }, 5, after(5.5))).toBe(false);
    expect(sessions.idleTooLong({ lastActiveAt: at, createdAt: at }, 5, after(6.5))).toBe(true);
    expect(sessions.idleTooLong({ lastActiveAt: null, createdAt: at }, 5, after(7))).toBe(true);
    // Never, when set to 0.
    expect(sessions.idleTooLong({ lastActiveAt: at, createdAt: at }, 0, after(600))).toBe(false);
  });

  it("allow one sign-in at a time when set: a new one ends the others", async () => {
    const helpdesk = await asUser("it@applus.test");
    await rules(false);
    await signIn("it@applus.test");
    await signIn("it@applus.test");
    expect((await sessionsOf(helpdesk.id)).length).toBeGreaterThanOrEqual(2);
    await rules(true);
    const token = await signIn("it@applus.test");
    const left = await sessionsOf(helpdesk.id);
    expect(left.map((x) => x.token)).toEqual([token]);
    // A new sign-in is active from the start.
    expect(left[0].lastActiveAt).not.toBeNull();
  });

  it("list where an account is signed in, and end one, the others, or all", async () => {
    await rules(false);
    const tech = await asUser("it2@applus.test");
    await signIn("it2@applus.test");
    await signIn("it2@applus.test");
    const [first, second] = await sessionsOf(tech.id);
    const list = await sessions.listSessions(tech.id, first.id);
    expect(list.find((x) => x.current)?.id).toBe(first.id);
    expect(list[0]).toMatchObject({ browser: "Edge", system: "Windows" });
    expect(await sessions.endSession(tech.id, second.id)).toBe(1);
    // Another account's sign-in is not ended by it.
    expect(await sessions.endSession(admin.id, first.id)).toBe(0);
    await signIn("it2@applus.test");
    expect(await sessions.endSessions(tech.id, first.id)).toBe(1);
    expect((await sessionsOf(tech.id)).map((x) => x.id)).toEqual([first.id]);
    expect(await sessions.endSessions(tech.id)).toBe(1);
    expect(await sessionsOf(tech.id)).toEqual([]);
  });

  it("end an account's sign-ins everywhere when its password is reset", async () => {
    await rules(false);
    const tech = await asUser("it2@applus.test");
    await signIn("it2@applus.test");
    await signIn("it2@applus.test");
    await updateUser(tech.id, userUpdate.parse({ password: "Brand-New-Pass-77" }), admin);
    expect(await sessionsOf(tech.id)).toEqual([]);
    // One's own: everywhere but where one is.
    await signIn("admin@applus.test");
    await signIn("admin@applus.test");
    const [mine] = await sessionsOf(admin.id);
    await updateUser(admin.id, userUpdate.parse({ password: "Another-New-Pass-88" }), admin, mine.id);
    expect((await sessionsOf(admin.id)).map((x) => x.id)).toEqual([mine.id]);
  });

  it("keep an Admin's sign-ins from an IT Admin", async () => {
    const itAdmin = await asUser("it3@applus.test");
    await expect(checkManage(admin.id, itAdmin)).rejects.toMatchObject({ status: 404 });
    await expect(checkManage((await asUser("it@applus.test")).id, itAdmin)).resolves.toBeUndefined();
  });

  it("read a browser's description for people", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toEqual({ browser: "Safari", system: "iPhone" });
    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0")).toEqual({ browser: "Firefox", system: "Linux" });
    expect(describeDevice(null)).toEqual({ browser: null, system: null });
  });
});
