import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ONBOARDING_TASKS, OFFBOARDING_TASKS } from "@/lib/domain";
import { vulnerabilityInput } from "@/lib/schemas";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const tickets = await import("@/server/services/tickets");
const kb = await import("@/server/services/kb");
const changes = await import("@/server/services/changes");
const assets = await import("@/server/services/assets");
const licenses = await import("@/server/services/licenses");
const finance = await import("@/server/services/finance");
const projects = await import("@/server/services/projects");
const risk = await import("@/server/services/risk");
const people = await import("@/server/services/people");
const lookups = await import("@/server/services/lookups");
const settings = await import("@/server/settings");
const { listAudit } = await import("@/server/services/audit-log");
const { dashboard } = await import("@/server/services/dashboard");
const kpis = await import("@/server/services/kpis");

type User = Awaited<ReturnType<typeof asUser>>;
let admin: User;
let it_: User;
let employee: User;

beforeAll(async () => {
  await seedDemo(NOW);
  [admin, it_, employee] = await Promise.all(
    ["admin@applus.test", "it@applus.test", "employee@applus.test"].map(asUser),
  );
}, 120_000);

const lastAudit = async (entity: string) =>
  (await db.select().from(s.auditLog).where(eq(s.auditLog.entity, entity)).orderBy(desc(s.auditLog.id)).limit(1))[0];

const ticketInput = {
  type: "request" as const,
  subject: "Monitor flickers",
  description: "The external monitor flickers every few minutes.",
  issueType: "hardware",
  location: "jeddah",
  priority: "critical" as const,
  requesterId: null,
  assigneeId: null,
  assetId: null,
};

describe("tickets", () => {
  it("shows IT every ticket and an employee only their own", async () => {
    const all = await tickets.listTickets(it_);
    const own = await tickets.listTickets(employee);
    expect(all).toHaveLength(587);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((t) => t.requesterId === employee.employeeId)).toBe(true);
  });

  it("hides another person's ticket from an employee as if it did not exist", async () => {
    const [other] = await db.select().from(s.tickets).where(eq(s.tickets.requesterId, employee.employeeId! + 1)).limit(1);
    await expect(tickets.getTicket(employee, other.id)).rejects.toMatchObject({ status: 404 });
    await expect(tickets.getTicket(it_, other.id)).resolves.toMatchObject({ id: other.id });
  });

  it("files an employee's request for themselves at medium priority, whatever they send", async () => {
    const row = await tickets.createTicket(employee, { ...ticketInput, requesterId: 1, assigneeId: it_.id });
    expect(row).toMatchObject({ requesterId: employee.employeeId, priority: "medium", assigneeId: null, status: "open" });
    expect(row.dueAt.getTime() - row.createdAt.getTime()).toBe(24 * 3_600_000);
    expect((await lastAudit("ticket")).summary).toMatch(/^Opened IT\d{6}: Monitor flickers$/);
  });

  it("requires IT to say who a ticket is for", async () => {
    await expect(tickets.createTicket(it_, ticketInput)).rejects.toMatchObject({ status: 400 });
    const row = await tickets.createTicket(it_, { ...ticketInput, requesterId: employee.employeeId! });
    expect(row.priority).toBe("critical");
  });

  it("walks the resolve, confirm and reopen flow", async () => {
    const t = await tickets.createTicket(it_, { ...ticketInput, requesterId: employee.employeeId! });
    await expect(tickets.updateTicket(employee, t.id, { status: "closed" })).rejects.toMatchObject({ status: 400 });

    const resolved = await tickets.updateTicket(it_, t.id, { status: "resolved", resolution: "Replaced the cable." });
    expect(resolved.resolvedAt).not.toBeNull();

    const closed = await tickets.updateTicket(employee, t.id, { status: "closed", satisfaction: 5 });
    expect(closed).toMatchObject({ status: "closed", satisfaction: 5 });
    expect((await lastAudit("ticket")).summary).toContain("rated 5/5");

    const reopened = await tickets.updateTicket(it_, t.id, { status: "open" });
    expect(reopened).toMatchObject({ status: "open", reopenCount: 1, resolvedAt: null, closedAt: null, satisfaction: null });
  });

  it("stops an employee changing anything but status and rating", async () => {
    const [own] = await tickets.listTickets(employee);
    await expect(tickets.updateTicket(employee, own.id, { priority: "critical" })).rejects.toMatchObject({ status: 403 });
  });

  it("recalculates the due time from opening when priority changes", async () => {
    const t = await tickets.createTicket(it_, { ...ticketInput, requesterId: employee.employeeId!, priority: "low" });
    const updated = await tickets.updateTicket(it_, t.id, { priority: "high" });
    expect(updated.dueAt.getTime() - t.createdAt.getTime()).toBe(8 * 3_600_000);
  });

  it("uses the SLA targets saved in Settings", async () => {
    await settings.putSetting("sla", { critical: 2, high: 8, medium: 24, low: 72 }, admin);
    const t = await tickets.createTicket(it_, { ...ticketInput, requesterId: employee.employeeId! });
    expect(t.dueAt.getTime() - t.createdAt.getTime()).toBe(2 * 3_600_000);
    await settings.putSetting("sla", { critical: 4, high: 8, medium: 24, low: 72 }, admin);
  });

  it("keeps comments and history with the ticket", async () => {
    const [own] = await tickets.listTickets(employee);
    await tickets.addComment(employee, own.id, { body: "Still happening after a restart." });
    const detail = await tickets.getTicket(employee, own.id);
    expect(detail.comments.at(-1)).toMatchObject({ body: "Still happening after a restart.", authorName: "Nora Al-Otaibi" });
    expect(detail.history[0].summary).toMatch(/^Opened/);
    const [other] = await db.select().from(s.tickets).where(eq(s.tickets.requesterId, employee.employeeId! + 1)).limit(1);
    await expect(tickets.addComment(employee, other.id, { body: "x" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("knowledge base", () => {
  it("shows employees published articles only", async () => {
    const forIt = await kb.listArticles(it_);
    const forEmployee = await kb.listArticles(employee);
    expect(forIt).toHaveLength(12);
    expect(forEmployee).toHaveLength(10);
    const draft = forIt.find((a) => a.status === "draft")!;
    await expect(kb.getArticle(employee, draft.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("changes", () => {
  it("approves once, implements with a result, and then stays closed", async () => {
    const change = await changes.createChange(
      {
        title: "Replace UPS batteries",
        assetId: null,
        description: "Swap both battery packs.",
        reason: "Batteries are at 80%.",
        risk: "low",
        rollbackPlan: "Refit the old packs.",
        plannedAt: "2026-10-10T19:00:00+03:00",
        vendor: null,
        ticketId: null,
        notes: null,
      },
      it_,
    );
    await expect(changes.decideChange(change.id, { status: "implemented", result: "successful" }, admin)).rejects.toMatchObject({ status: 400 });
    const approved = await changes.decideChange(change.id, { status: "approved" }, admin);
    expect(approved.approvedBy).toBe(admin.id);
    const done = await changes.decideChange(change.id, { status: "implemented", result: "successful" }, it_);
    expect(done.implementedAt).not.toBeNull();
    await expect(
      changes.updateChange(change.id, { ...change, plannedAt: change.plannedAt.toISOString(), notes: null }, it_),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("assets and CMDB", () => {
  it("moves an asset, records the movement and sets its status", async () => {
    const [spare] = await db.select().from(s.assets).where(eq(s.assets.status, "in_stock")).limit(1);
    const moved = await assets.moveAsset(spare.id, { toLocation: "riyadh", toEmployeeId: employee.employeeId, reason: "New hire kit" }, it_);
    expect(moved).toMatchObject({ location: "riyadh", assignedTo: employee.employeeId, status: "in_use" });
    const returned = await assets.moveAsset(spare.id, { toLocation: "jeddah", toEmployeeId: null, reason: "Returned" }, it_);
    expect(returned.status).toBe("in_stock");
    const detail = await assets.getAsset(spare.id);
    expect(detail.movements.map((m) => m.reason)).toEqual(["Returned", "New hire kit"]);
    expect(detail.movements[1].toEmployeeName).toBe("Nora Al-Otaibi");
  });

  it("refuses the same relationship twice", async () => {
    const [rel] = await assets.listRelationships();
    await expect(
      assets.createRelationship({ sourceId: rel.sourceId, targetId: rel.targetId, type: rel.type }, it_),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("lists an asset's installed software and relations", async () => {
    const [exch] = await db.select().from(s.assets).where(eq(s.assets.name, "EXCH01"));
    const detail = await assets.getAsset(exch.id);
    expect(detail.relationships.length).toBeGreaterThanOrEqual(3);
  });
});

describe("licences", () => {
  it("counts installs and adds or removes them", async () => {
    const all = await licenses.listLicenses();
    const acrobat = all.find((l) => l.product === "Adobe Acrobat Pro")!;
    expect(acrobat).toMatchObject({ seats: 10, installs: 12 });
    const [laptop] = await db.select().from(s.assets).where(eq(s.assets.status, "in_stock")).limit(1);
    await licenses.addInstall(acrobat.id, { assetId: laptop.id }, it_);
    expect((await licenses.getLicense(acrobat.id)).installs).toBe(13);
    await licenses.removeInstall(acrobat.id, laptop.id, it_);
    expect((await licenses.getLicense(acrobat.id)).devices).toHaveLength(12);
  });
});

describe("finance", () => {
  it("moves a purchase from request to receipt and no further", async () => {
    const p = await finance.createPurchase(
      { title: "Spare keyboards", category: "hardware", vendorId: null, requestedFor: null, quantity: 5, amount: 500, hardware: true, notes: null },
      it_,
    );
    await expect(finance.setPurchaseStatus(p.id, { status: "received" }, admin)).rejects.toMatchObject({ status: 400 });
    const approved = await finance.setPurchaseStatus(p.id, { status: "approved" }, admin);
    expect(approved).toMatchObject({ approvedBy: admin.id });
    await expect(finance.updatePurchase(p.id, { ...p, notes: null }, it_)).rejects.toMatchObject({ status: 400 });
    await finance.setPurchaseStatus(p.id, { status: "ordered" }, it_);
    const received = await finance.setPurchaseStatus(p.id, { status: "received" }, it_);
    expect(received.receivedAt).not.toBeNull();
  });

  it("reports the year's budget with committed spend", async () => {
    const summary = await finance.budgetSummary(2026);
    expect(summary).toMatchObject({ fiscalYear: 2026, from: "2026-01-01", to: "2026-12-31" });
    const hardware = summary.lines.find((l) => l.category === "hardware")!;
    expect(hardware.budget).toBe(180_000);
    expect(hardware.committed).toBeGreaterThan(0);
    await finance.setBudget({ fiscalYear: 2026, category: "hardware", amount: 200_000 }, admin);
    expect((await finance.budgetSummary(2026)).lines.find((l) => l.category === "hardware")!.budget).toBe(200_000);
  });

  it("counts how much of a purchase is already in the inventory", async () => {
    const list = await finance.listPurchases();
    const laptops = list.find((p) => p.title === "Replacement laptops, lifecycle batch 1")!;
    const [{ n }] = await db.select({ n: count() }).from(s.assets).where(eq(s.assets.purchaseId, laptops.id));
    expect(n).toBeGreaterThan(0);
    expect(laptops.inInventory).toBe(n);
    expect(list.find((p) => p.title === "24-inch monitors")!.inInventory).toBe(0);
  });
});

describe("projects", () => {
  it("counts finished tasks towards progress", async () => {
    const project = await projects.createProject({ name: "Test rollout", description: null, ownerId: it_.id, status: "active", startDate: null, dueDate: null }, it_);
    const task = await projects.createTask(project.id, { title: "Step one", assigneeId: null, status: "todo", dueDate: null }, it_);
    await projects.createTask(project.id, { title: "Step two", assigneeId: null, status: "todo", dueDate: null }, it_);
    await projects.updateTask(task.id, { title: "Step one", assigneeId: null, status: "done", dueDate: null }, it_);
    expect(await projects.getProject(project.id)).toMatchObject({ taskCount: 2, doneCount: 1 });
  });
});

describe("risk and vulnerabilities", () => {
  it("stamps the resolution date when a vulnerability is resolved", async () => {
    const v = await risk.createVulnerability(
      { title: "Test finding", severity: "low", assetId: null, description: null, detectedOn: "2026-09-01", detectionMethod: null, status: "open", deadline: "2026-10-01", resolution: null, ownerId: null },
      it_,
    );
    expect(v.resolvedOn).toBeNull();
    // Routes always parse the body first, which drops fields such as id and timestamps.
    const input = vulnerabilityInput.parse({ ...v, status: "resolved", resolution: "Patched" });
    const fixed = await risk.updateVulnerability(v.id, input, it_);
    expect(fixed.resolvedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("directory", () => {
  it("profiles an employee with the devices they hold and the tickets they raised", async () => {
    const profile = await people.employeeProfile(employee.employeeId!);
    expect(profile.name).toBe("Nora Al-Otaibi");
    expect(profile.assets.length).toBeGreaterThan(0);
    expect(profile.tickets.length).toBeGreaterThan(0);
    expect(profile.tickets.length).toBeLessThanOrEqual(10);
    const times = profile.tickets.map((t) => t.createdAt.getTime());
    expect(times).toEqual(times.toSorted((a, b) => b - a));
  });
});

describe("joiners and leavers", () => {
  it("completes onboarding only when every step is done, adding the employee", async () => {
    const joiner = await people.createJoiner(
      { name: "Test Joiner", email: "test.joiner@applus.test", department: "sales", location: "riyadh", jobTitle: "Account Manager", startDate: "2026-10-05" },
      it_,
    );
    await expect(people.completeJoiner(joiner.id, it_)).rejects.toMatchObject({ status: 400 });
    await people.updateJoinerTasks(joiner.id, { tasks: { ...Object.fromEntries(ONBOARDING_TASKS.map((t) => [t.key, true])), injected: true } }, it_);
    const done = await people.completeJoiner(joiner.id, it_);
    expect(done.employeeId).not.toBeNull();
    expect(Object.keys(done.tasks)).not.toContain("injected");
    expect((await people.getEmployee(done.employeeId!)).email).toBe("test.joiner@applus.test");
  });

  it("marks the employee inactive when offboarding finishes", async () => {
    const [someone] = await db.select().from(s.employees).where(and(eq(s.employees.active, true), eq(s.employees.department, "sales"))).limit(1);
    const leaver = await people.createLeaver({ employeeId: someone.id, resignationDate: "2026-09-01", forwardTo: null, notes: null }, it_);
    await people.updateLeaver(leaver.id, { tasks: Object.fromEntries(OFFBOARDING_TASKS.map((t) => [t, true])) }, it_);
    expect((await people.getEmployee(someone.id)).active).toBe(false);
  });

  it("lists IT staff for assignment", async () => {
    const staff = await people.listStaff();
    expect(staff.map((u) => u.role).sort()).toEqual(["admin", "it_staff", "it_staff", "it_staff"]);
  });
});

describe("settings and reference lists", () => {
  it("falls back to defaults and validates what is saved", async () => {
    expect(await settings.getSetting("organisation")).toEqual({ name: "AP Plus", fiscalYearStartMonth: 1 });
    await expect(settings.putSetting("monitoring", { enabled: true }, admin)).rejects.toThrow();
    await settings.putKpiTargets(2027, (await settings.getKpiTargets(2026)), admin);
    expect((await settings.getKpiTargets(2027)).tat.target).toBe(0.9);
  });

  it("keeps a list code fixed when an admin renames it", async () => {
    const row = await lookups.createLookup({ list: "location", code: "dammam", labelEn: "Dammam", labelAr: "الدمام", sortOrder: 5, active: true }, admin);
    const renamed = await lookups.updateLookup(row.id, { list: "department", code: "changed", labelEn: "Dammam Office", labelAr: "مكتب الدمام", sortOrder: 5, active: false }, admin);
    expect(renamed).toMatchObject({ list: "location", code: "dammam", labelEn: "Dammam Office", active: false });
    expect((await lookups.listLookups()).some((l) => l.code === "dammam")).toBe(false);
    expect((await lookups.listLookups({ includeInactive: true })).some((l) => l.code === "dammam")).toBe(true);
  });

  it("audits changes by who made them, filterable by entity and person", async () => {
    const entries = await listAudit({ entity: "lookup", userId: admin.id });
    expect(entries[0]).toMatchObject({ userName: "Sara Al-Harbi", action: "update" });
    const [{ n }] = await db.select({ n: count() }).from(s.auditLog).where(eq(s.auditLog.entity, "settings"));
    expect(n).toBeGreaterThan(0);
  });
});

describe("dashboard", () => {
  it("agrees with the records it summarises", async () => {
    const data = await dashboard(NOW);
    const [{ n: open }] = await db
      .select({ n: count() })
      .from(s.tickets)
      .where(inArray(s.tickets.status, ["open", "in_progress", "on_hold"]));
    expect(data.tiles.openTickets).toBe(open);
    expect(data.tiles.slaCompliance).toBeGreaterThan(0);
    expect(data.tiles.availability).toBeGreaterThan(0.9);
    expect(data.tiles.fiscalYear).toBe(2026);
    expect(data.attention.find((g) => g.kind === "down")!.items.map((i) => i.label)).toEqual(["AP-RYD-03"]);
    expect(data.attention.find((g) => g.kind === "licenses")!.count).toBeGreaterThan(0);
    expect(data.charts.ticketsByMonth).toHaveLength(12);
    const [{ n: lastYear }] = await db
      .select({ n: count() })
      .from(s.tickets)
      .where(gte(s.tickets.createdAt, new Date("2025-10-01T00:00:00+03:00")));
    expect(data.charts.ticketsByMonth.reduce((n, m) => n + m.opened, 0)).toBe(lastYear);
    expect(data.charts.budget.map((l) => l.category)).toContain("hardware");
  });
});

describe("KPIs", () => {
  it("reports the year from tickets and the figures IT staff entered", async () => {
    const { rows } = await kpis.kpis(2026, NOW);
    const training = rows.find((r) => r.kpi === "training_hours")!;
    expect(training).toMatchObject({ quarters: [42, 38, 45, null], year: 125, status: "amber" });
    const tat = rows.find((r) => r.kpi === "tat")!;
    expect(tat.quarters.slice(0, 3).every((q) => q !== null && q > 0 && q <= 1)).toBe(true);
    expect(tat.quarters[3]).toBeNull();
  });

  it("records and clears quarterly figures, with an audit entry", async () => {
    await kpis.setKpiActuals({ year: 2024, kpi: "iso_ncs", quarters: [2, null, 1, null] }, it_);
    expect((await kpis.kpis(2024, NOW)).rows.find((r) => r.kpi === "iso_ncs")!.quarters).toEqual([2, null, 1, null]);
    await kpis.setKpiActuals({ year: 2024, kpi: "iso_ncs", quarters: [null, 0, 1, null] }, it_);
    expect((await kpis.kpis(2024, NOW)).rows.find((r) => r.kpi === "iso_ncs")!.quarters).toEqual([null, 0, 1, null]);
    expect((await lastAudit("kpi")).summary).toBe("Recorded iso_ncs for 2024: Q1 –, Q2 0, Q3 1, Q4 –");
  });
});
