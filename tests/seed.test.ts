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
    expect(counts).toEqual({ employees: 65, assets: 137, tickets: 587 });
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
