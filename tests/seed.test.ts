import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isoDate } from "@/lib/dates";
import { licenseState } from "@/lib/licenses";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedReference, REFERENCE } = await import("@/server/seed/reference");
const { seedDemo } = await import("@/server/seed/demo");
const { cleanPeople } = await import("@/server/seed/people");
const { NOW } = await import("./helpers/seeded");

describe("reference seed", () => {
  it("adds every list once and can run again without duplicating or overwriting", async () => {
    await seedReference();
    const expected = Object.values(REFERENCE).flat().length;
    const [{ n }] = await db.select({ n: count() }).from(s.lookups);
    expect(n).toBe(expected);

    await db.update(s.lookups).set({ labelEn: "Jeddah HQ" }).where(eq(s.lookups.code, "jeddah"));
    await seedReference();
    const [again] = await db.select({ n: count() }).from(s.lookups);
    expect(again.n).toBe(expected);
    const [jeddah] = await db.select().from(s.lookups).where(eq(s.lookups.code, "jeddah"));
    expect(jeddah.labelEn).toBe("Jeddah HQ");
  });

  it("labels every value in both languages", () => {
    for (const [code, en, ar] of Object.values(REFERENCE).flat()) {
      expect(code).toMatch(/^[a-z0-9_]+$/);
      expect(en.trim()).not.toBe("");
      expect(ar.trim()).not.toBe("");
    }
  });
});

describe("demo seed", () => {
  let counts: Awaited<ReturnType<typeof seedDemo>>;
  beforeAll(async () => {
    counts = await seedDemo(NOW);
  }, 120_000);

  it("produces the same data for the same date", async () => {
    const { accounts, ...totals } = counts;
    expect(totals).toEqual({ employees: 65, assets: 137, tickets: 587 });
    expect(accounts.map((a) => a.email)).toEqual(["admin@applus.test", "it@applus.test", "it2@applus.test", "it3@applus.test", "employee@applus.test"]);
  });

  it("creates one account per role, each linked to an employee", async () => {
    const users = await db.select().from(s.users);
    expect(users.map((u) => u.role).sort()).toEqual(["admin", "employee", "it_staff", "it_staff", "it_staff"]);
    expect(users.every((u) => u.employeeId !== null)).toBe(true);
  });

  it("keeps every ticket inside its own timeline", async () => {
    const tickets = await db.select().from(s.tickets);
    for (const t of tickets) {
      expect(t.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      if (t.resolvedAt) expect(t.resolvedAt >= t.createdAt).toBe(true);
      if (t.closedAt) expect(t.closedAt >= t.resolvedAt!).toBe(true);
      expect(t.dueAt > t.createdAt).toBe(true);
      if (t.status === "closed") expect(t.closedAt).not.toBeNull();
      if (t.status === "open" || t.status === "in_progress" || t.status === "on_hold") expect(t.resolvedAt).toBeNull();
    }
    expect(new Set(tickets.map((t) => t.status))).toEqual(new Set(["open", "in_progress", "on_hold", "resolved", "closed"]));
  });

  it("gives the employee demo account a resolved ticket to confirm", async () => {
    const [nora] = await db.select().from(s.employees).where(eq(s.employees.email, "employee@applus.test"));
    const theirs = await db.select().from(s.tickets).where(eq(s.tickets.requesterId, nora.id));
    expect(theirs.map((t) => t.status)).toContain("resolved");
    expect(theirs.map((t) => t.status)).toContain("in_progress");
  });

  it("writes an opening history entry for every ticket", async () => {
    const [{ n }] = await db.select({ n: count() }).from(s.auditLog).where(eq(s.auditLog.action, "create"));
    expect(n).toBe(587);
  });

  it("includes each licence state the compliance page shows", async () => {
    const licences = await db.select().from(s.licenses);
    const installs = await db.select().from(s.licenseInstalls);
    const today = isoDate(NOW);
    const states = licences.map((l) => licenseState(l, installs.filter((i) => i.licenseId === l.id).length, today));
    expect(new Set(states)).toEqual(new Set(["compliant", "expiring", "expired", "over_deployed"]));
  });

  it("leaves monitoring paused, with one device down and an open alert", async () => {
    const [monitoring] = await db.select().from(s.settings).where(eq(s.settings.key, "monitoring"));
    expect((monitoring.value as { enabled: boolean }).enabled).toBe(false);
    const down = await db.select().from(s.assets).where(eq(s.assets.monitorStatus, "down"));
    expect(down.map((a) => a.name)).toEqual(["AP-RYD-03"]);
    const open = await db.select().from(s.alerts).where(eq(s.alerts.status, "open"));
    expect(open).toHaveLength(1);
  });

  it("can run twice, replacing what was there", async () => {
    await seedDemo(NOW);
    const [{ n }] = await db.select({ n: count() }).from(s.tickets);
    expect(n).toBe(587);
  }, 120_000);
});

describe("demo seed with a staff list", () => {
  // Invented names standing in for a real list.
  const header = ["Full Name", "Designation", "Department", "Email", "Role", "active"];
  const rows = [
    ["Hala Lead", "IT Manager", "IT", "hala@example.test", "admin", "YES"],
    ["Omar Desk", "IT Officer", "IT", "omar@example.test", "IT staff", "YES"],
    ["Sami Guard", "Security Officer", "Operations", "sami@example.test", "admin", "YES"],
    ["Dina Chief", "General Manager", "Executive", "dina@example.test", "admin", "YES"],
    ...["Sales", "Sales", "Finance and Accounting", "Operations", "Operations", "HR", "Compliance", "Operations", "Sales", "Finance"].map(
      (dept, i) => [`Person ${i}`, "Officer", dept, `person${i}@example.test`, null, "YES"],
    ),
    ["No Mail", "Officer", "Sales", null, null, "YES"],
    ...[0, 1, 2].map((i) => [`Former ${i}`, "Officer", "Operations", `former${i}@example.test`, null, "NO"]),
    ["Former Admin", "IT Officer", "IT", "former.admin@example.test", "admin", "NO"],
  ];
  const { people } = cleanPeople([header, ...rows]);
  let counts: Awaited<ReturnType<typeof seedDemo>>;
  let emailOf: Map<string, string>;
  beforeAll(async () => {
    counts = await seedDemo(NOW, { people });
    const users = await db.select().from(s.users);
    emailOf = new Map(users.map((u) => [u.id, u.email]));
  }, 120_000);

  it("uses exactly the listed people and none of the invented ones", async () => {
    const employees = await db.select().from(s.employees);
    expect(counts.employees).toBe(people.length);
    expect(employees.map((e) => e.name).sort()).toEqual(people.map((p) => p.name).sort());
    expect(employees.filter((e) => !e.active).map((e) => e.name).sort()).toEqual(["Former 0", "Former 1", "Former 2", "Former Admin"]);
  });

  it("creates the listed accounts only, each with its own one-time password", async () => {
    expect(counts.accounts.map((a) => [a.email, a.role])).toEqual([
      ["hala@example.test", "admin"],
      ["omar@example.test", "it_staff"],
      ["sami@example.test", "admin"],
      ["dina@example.test", "admin"],
    ]);
    const passwords = counts.accounts.map((a) => a.password);
    expect(new Set(passwords).size).toBe(4);
    for (const password of passwords) expect(password.length).toBeGreaterThanOrEqual(16);
    const users = await db.select().from(s.users);
    expect(users).toHaveLength(4);
    expect(users.every((u) => u.employeeId !== null)).toBe(true);
  });

  it("has active people outside the IT team raise tickets, and the team work them", async () => {
    const employees = await db.select().from(s.employees);
    const byId = new Map(employees.map((e) => [e.id, e]));
    const tickets = await db.select().from(s.tickets);
    expect(tickets.length).toBeGreaterThan(400);
    const team = ["hala@example.test", "omar@example.test", "sami@example.test"];
    for (const t of tickets) {
      const requester = byId.get(t.requesterId)!;
      expect(requester.active).toBe(true);
      expect(team).not.toContain(requester.email);
      if (t.assigneeId) expect(team).toContain(emailOf.get(t.assigneeId));
    }
    // The helpdesk takes the most.
    const load = Map.groupBy(tickets.filter((t) => t.assigneeId), (t) => emailOf.get(t.assigneeId!));
    expect(Math.max(...[...load.values()].map((l) => l.length))).toBe(load.get("omar@example.test")!.length);
  });

  it("keeps executives out of the IT work", async () => {
    const owners = [
      ...(await db.select({ id: s.projects.ownerId }).from(s.projects)),
      ...(await db.select({ id: s.risks.ownerId }).from(s.risks)),
      ...(await db.select({ id: s.vulnerabilities.ownerId }).from(s.vulnerabilities)),
      ...(await db.select({ id: s.purchases.requestedBy }).from(s.purchases)),
    ].map((o) => emailOf.get(o.id!));
    expect(owners).not.toContain("dina@example.test");
    const [approver] = await db.select({ id: s.purchases.approvedBy }).from(s.purchases).where(eq(s.purchases.status, "approved"));
    expect(emailOf.get(approver.id!)).toBe("hala@example.test");
  });

  it("shows only people already inactive as leaving, and the newest hires as onboarded", async () => {
    const employees = await db.select().from(s.employees);
    const byId = new Map(employees.map((e) => [e.id, e]));
    const leavers = await db.select().from(s.leavers);
    expect(leavers.map((l) => byId.get(l.employeeId)!.name).sort()).toEqual(["Former 0", "Former 1", "Former 2", "Former Admin"]);
    for (const l of leavers) if (l.forwardTo) expect(byId.get(l.employeeId)!.department).toBe(employees.find((e) => e.email === l.forwardTo)!.department);

    const joiners = await db.select().from(s.joiners);
    for (const j of joiners) {
      expect(j.completedAt).not.toBeNull();
      expect(byId.get(j.employeeId!)!.email).toBe(j.email);
    }
    expect(joiners.map((j) => j.email).sort()).toEqual(["person7@example.test", "person8@example.test", "person9@example.test"]);
  });

  it("refuses a list that gives no one an account", async () => {
    const { people: nobody } = cleanPeople([header, ["Solo Person", "Officer", "Sales", "solo@example.test", null, "YES"]]);
    await expect(seedDemo(NOW, { people: nobody })).rejects.toThrow(/No one in the staff list gets an account/);
  }, 120_000);
});
