import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { userCreate, userUpdate } from "@/lib/schemas";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { auth } = await import("@/server/auth");
const { seedDemo, DEMO_PASSWORD } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const { createUser, listUsers, updateUser } = await import("@/server/services/users");

let admin: Awaited<ReturnType<typeof asUser>>;
beforeAll(async () => {
  await seedDemo(NOW);
  admin = await asUser("admin@applus.test");
}, 120_000);

const signIn = (email: string, password: string) => auth.api.signInEmail({ body: { email, password } });
const sessionsOf = async (userId: string) =>
  (await db.select({ n: count() }).from(s.sessions).where(eq(s.sessions.userId, userId)))[0].n;

describe("user management", () => {
  it("lists every account with its linked employee", async () => {
    const rows = await listUsers();
    expect(rows).toHaveLength(5);
    expect(rows.find((u) => u.email === "employee@applus.test")?.employeeName).toBe("Nora Al-Otaibi");
  });

  it("creates an account that can sign in, linked to its employee", async () => {
    const [employee] = await db.select().from(s.employees).where(eq(s.employees.department, "sales")).limit(1);
    const input = userCreate.parse({ name: employee.name, email: employee.email, role: "employee", employeeId: employee.id, password: "Temporary-Pass-1" });
    const user = await createUser(input, admin);
    expect(user).toMatchObject({ role: "employee", employeeId: employee.id });
    await expect(signIn(employee.email, "Temporary-Pass-1")).resolves.toMatchObject({ user: { id: user.id } });
  });

  it("requires an employee record for the employee role", () => {
    const parsed = userCreate.safeParse({ name: "X", email: "x@applus.test", role: "employee", employeeId: null, password: "Temporary-Pass-1" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({ path: ["employeeId"], message: "validation.employeeRequired" });
  });

  it("stops admins changing their own role or deactivating themselves", async () => {
    await expect(updateUser(admin.id, { role: "it_staff" }, admin)).rejects.toMatchObject({ status: 403 });
    await expect(updateUser(admin.id, { active: false }, admin)).rejects.toMatchObject({ status: 403 });
    await expect(updateUser(admin.id, { role: "admin", active: true }, admin)).resolves.toMatchObject({ role: "admin" });
  });

  it("deactivates a user: sessions end and sign-in is refused, until reactivated", async () => {
    const tech = await asUser("it3@applus.test");
    await signIn(tech.email, DEMO_PASSWORD);
    expect(await sessionsOf(tech.id)).toBeGreaterThan(0);

    await updateUser(tech.id, { active: false }, admin);
    expect(await sessionsOf(tech.id)).toBe(0);
    await expect(signIn(tech.email, DEMO_PASSWORD)).rejects.toMatchObject({ body: { code: "BANNED_USER" } });

    await updateUser(tech.id, { active: true }, admin);
    await expect(signIn(tech.email, DEMO_PASSWORD)).resolves.toBeTruthy();
  });

  it("changes a role and resets a password", async () => {
    const tech = await asUser("it2@applus.test");
    const updated = await updateUser(tech.id, userUpdate.parse({ role: "admin", password: "Brand-New-Pass-9" }), admin);
    expect(updated.role).toBe("admin");
    await expect(signIn(tech.email, DEMO_PASSWORD)).rejects.toBeTruthy();
    await expect(signIn(tech.email, "Brand-New-Pass-9")).resolves.toBeTruthy();
    const [entry] = await db.select().from(s.auditLog).where(eq(s.auditLog.entityId, tech.id));
    expect(entry.summary).toBe("Updated Faisal Al-Qahtani: role admin, password reset");
    expect(entry.summary).not.toContain("Brand-New-Pass-9");
  });

  it("will not leave an employee account without an employee record", async () => {
    const nora = await asUser("employee@applus.test");
    await expect(updateUser(nora.id, { employeeId: null }, admin)).rejects.toMatchObject({ status: 400 });
  });
});
