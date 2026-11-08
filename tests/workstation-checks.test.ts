import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const { db } = await import("@/server/db");
const { assets, auditLog, employees } = await import("@/server/db/schema");
const checks = await import("@/server/services/workstation-checks");
const tokens = await import("@/server/services/api-tokens");
const message = await import("@/app/api/public/workstation/message/route");
const read = await import("@/app/api/public/workstation/message/[id]/read/route");
const publicKpis = await import("@/app/api/public/kpis/route");

type Admin = Awaited<ReturnType<typeof asUser>>;
let admin: Admin;
let nora: { id: number; name: string; email: string };
let pc: { id: number; name: string };
let workstationKey: string;
let kpiKey: string;

const post = (url: string, key: string | null, json: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(json) });
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
type Shown = { message: null | { id: number; code: string; result: string; firstName: string; toFix: { en: string; ar: string; note: string }[]; message: string } };
const fetchMessage = async (signIn: object, key = workstationKey) => (await message.POST(post("/api/public/workstation/message", key, signIn), undefined)).json() as Promise<Shown>;

beforeAll(async () => {
  await seedDemo(NOW);
  admin = await asUser("admin@applus.test");
  [nora] = await db.select({ id: employees.id, name: employees.name, email: employees.email }).from(employees).where(eq(employees.email, "employee@applus.test"));
  [pc] = await db.insert(assets).values({ name: "FIN-PC-07", category: "computers", type: "desktop", location: "jeddah", status: "in_use", assignedTo: nora.id }).returning({ id: assets.id, name: assets.name });
  workstationKey = (await tokens.createApiToken("Sign-in script", "workstation", admin)).token;
  kpiKey = (await tokens.createApiToken("Board dashboard", "kpis", admin)).token;
}, 120_000);

type Item = { code: string; state: "ok" | "not_ok" | "na"; note: string };
const allOk = async (): Promise<Item[]> => (await checks.workstationChecklist()).map((i) => ({ code: i.code, state: "ok", note: "" }));

describe("recording a check", () => {
  it("goes to the computer's employee, and the result follows from the items", async () => {
    const items = await allOk();
    expect(items).toHaveLength(12);
    const passed = await checks.createWorkstationCheck({ assetId: pc.id, employeeId: null, items, message: "Very tidy desk!" }, admin);
    expect(passed.result).toBe("passed");
    items[1] = { ...items[1], state: "not_ok", note: "Password on a note under the keyboard" };
    items[2] = { ...items[2], state: "na", note: "ignored" };
    const attention = await checks.createWorkstationCheck({ assetId: pc.id, employeeId: null, items, message: "" }, admin);
    expect(attention.result).toBe("attention");
    const saved = await checks.getWorkstationCheck(attention.id);
    expect(saved).toMatchObject({ computerName: "FIN-PC-07", employeeId: nora.id, employeeName: nora.name, checkedByName: admin.name, readAt: null });
    // The wording is kept as it stood, and a note is only kept on what needs fixing.
    expect(saved.items[1]).toMatchObject({ code: "no_written_passwords", state: "not_ok", note: "Password on a note under the keyboard" });
    expect(saved.items[1].labelAr).toMatch(/كلمات مرور/);
    expect(saved.items[2].note).toBe("");
    const list = await checks.listWorkstationChecks({ assetId: pc.id });
    expect(list.map((c) => c.toFix)).toEqual([1, 0]);
  });

  it("refuses items not on the checklist, or the same item twice", async () => {
    const items = await allOk();
    await expect(checks.createWorkstationCheck({ assetId: pc.id, employeeId: null, items: [...items, { code: "made_up", state: "ok", note: "" }], message: "" }, admin)).rejects.toThrow();
    await expect(checks.createWorkstationCheck({ assetId: pc.id, employeeId: null, items: [items[0], items[0]], message: "" }, admin)).rejects.toThrow();
  });
});

describe("at Windows sign-in", () => {
  it("needs a workstation key: none, a made-up one or a KPI key is refused", async () => {
    const signIn = { upn: "employee@applus.test", user: "employee", computer: "FIN-PC-07" };
    expect((await message.POST(post("/api/public/workstation/message", null, signIn), undefined)).status).toBe(401);
    expect((await message.POST(post("/api/public/workstation/message", "apit_made-up", signIn), undefined)).status).toBe(401);
    expect((await message.POST(post("/api/public/workstation/message", kpiKey, signIn), undefined)).status).toBe(401);
    // And the workstation key does not read the KPIs.
    const kpis = new Request("http://localhost/api/public/kpis?year=2026", { headers: { authorization: `Bearer ${workstationKey}` } });
    expect((await publicKpis.GET(kpis, undefined)).status).toBe(401);
  });

  it("shows the person their checks one at a time, oldest first, until each is read", async () => {
    // The domain's UPN can differ from the email's domain: the name before the @ matches.
    const signIn = { upn: "employee@applus.local", user: "APPLUS\\employee", computer: "ANOTHER-PC" };
    const first = (await fetchMessage(signIn)).message!;
    expect(first).toMatchObject({ result: "passed", firstName: "Nora", message: "Very tidy desk!", toFix: [] });
    // Closed without reading: it shows again, with a new code; the old one no longer works.
    const again = (await fetchMessage(signIn)).message!;
    expect(again.id).toBe(first.id);
    expect(again.code).not.toBe(first.code);
    const stale = await read.POST(post(`/api/public/workstation/message/${first.id}/read`, workstationKey, { ...signIn, code: first.code }), ctx(first.id));
    expect(stale.status).toBe(404);
    const ok = await read.POST(post(`/api/public/workstation/message/${first.id}/read`, workstationKey, { ...signIn, code: again.code }), ctx(first.id));
    expect(ok.status).toBe(200);
    const saved = await checks.getWorkstationCheck(first.id);
    expect(saved).toMatchObject({ readBy: "employee@applus.local", readOn: "ANOTHER-PC" });
    expect(saved.readAt).not.toBeNull();
    const [logged] = await db.select().from(auditLog).where(eq(auditLog.entityId, String(first.id)));
    expect(logged).toBeDefined();

    // Then the next one: what to fix, in both languages.
    const second = (await fetchMessage(signIn)).message!;
    expect(second.result).toBe("attention");
    expect(second.toFix).toEqual([expect.objectContaining({ en: expect.stringMatching(/passwords/i), note: "Password on a note under the keyboard" })]);
  });

  it("does not show or mark someone else's message", async () => {
    const nora = { upn: "employee@applus.test", user: "employee", computer: "FIN-PC-07" };
    const shown = (await fetchMessage(nora)).message!;
    // Another account the app knows: none of Nora's messages, and it cannot mark hers read.
    const omar = { upn: "it@applus.test", user: "it", computer: "FIN-PC-07" };
    expect((await fetchMessage(omar)).message).toBeNull();
    const res = await read.POST(post(`/api/public/workstation/message/${shown.id}/read`, workstationKey, { ...omar, code: shown.code }), ctx(shown.id));
    expect(res.status).toBe(404);
    expect((await checks.getWorkstationCheck(shown.id)).readAt).toBeNull();
    // Without the key, nothing either.
    const keyless = await read.POST(post(`/api/public/workstation/message/${shown.id}/read`, null, { ...nora, code: shown.code }), ctx(shown.id));
    expect(keyless.status).toBe(401);
  });

  it("goes by the computer's name for an account the app does not know", async () => {
    const [shared] = await db.insert(assets).values({ name: "RECEPTION-PC", category: "computers", type: "desktop", location: "jeddah", status: "in_use" }).returning({ id: assets.id });
    await checks.createWorkstationCheck({ assetId: shared.id, employeeId: null, items: await allOk(), message: "" }, admin);
    const stranger = { upn: "temp.staff@applus.local", user: "temp.staff", computer: "reception-pc" };
    const shown = (await fetchMessage(stranger)).message!;
    expect(shown).toMatchObject({ result: "passed", firstName: "" });
    expect((await fetchMessage({ ...stranger, computer: "OTHER-PC" })).message).toBeNull();
  });
});

describe("in the app", () => {
  it("lists the person's own checks and marks only those read", async () => {
    const employee = await asUser("employee@applus.test");
    const mine = await checks.myWorkstationChecks(employee.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((c) => c.employeeId === nora.id)).toBe(true);
    const unread = mine.find((c) => !c.readAt)!;
    const it = await asUser("it@applus.test");
    await expect(checks.readMyWorkstationCheck(unread.id, it)).rejects.toThrow();
    await checks.readMyWorkstationCheck(unread.id, employee);
    expect(await checks.getWorkstationCheck(unread.id)).toMatchObject({ readBy: employee.name, readOn: "app" });
  });
});
