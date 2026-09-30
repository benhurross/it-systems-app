import { eq, ne } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));
const session = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/server/current-user", () => ({ currentUser: async () => session.user }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");

const routes = {
  tickets: await import("@/app/api/tickets/route"),
  ticket: await import("@/app/api/tickets/[id]/route"),
  assets: await import("@/app/api/assets/route"),
  kb: await import("@/app/api/kb/route"),
  lookups: await import("@/app/api/lookups/route"),
  settingsKey: await import("@/app/api/settings/[key]/route"),
  lists: await import("@/app/api/settings/lists/route"),
  audit: await import("@/app/api/audit/route"),
  relationships: await import("@/app/api/relationships/route"),
  budgets: await import("@/app/api/budgets/route"),
  network: await import("@/app/api/network/route"),
  check: await import("@/app/api/network/[id]/check/route"),
  acknowledge: await import("@/app/api/alerts/[id]/acknowledge/route"),
  dailyChecks: await import("@/app/api/daily-checks/route"),
  dashboard: await import("@/app/api/dashboard/route"),
  kpis: await import("@/app/api/kpis/route"),
};

const request = (method: string, body?: unknown) =>
  new Request("http://localhost/api", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = <T extends Record<string, string>>(values = {} as T) => ({ params: Promise.resolve(values) });

type User = Awaited<ReturnType<typeof asUser>>;
let admin: User;
let itStaff: User;
let employee: User;

beforeAll(async () => {
  await seedDemo(NOW);
  [admin, itStaff, employee] = await Promise.all(["admin@applus.test", "it@applus.test", "employee@applus.test"].map(asUser));
}, 120_000);

describe("access", () => {
  it("answers 401 to signed-out calls", async () => {
    session.user = null;
    for (const res of [
      await routes.tickets.GET(request("GET"), params()),
      await routes.assets.GET(request("GET"), params()),
      await routes.settingsKey.GET(request("GET"), params({ key: "sla" })),
    ]) {
      expect(res.status).toBe(401);
    }
  });

  it("keeps employees out of IT modules and admin areas", async () => {
    session.user = employee;
    expect((await routes.assets.GET(request("GET"), params())).status).toBe(403);
    expect((await routes.budgets.GET(request("GET"), params())).status).toBe(403);
    expect((await routes.kb.POST(request("POST", {}), params())).status).toBe(403);
    expect((await routes.audit.GET(request("GET"), params())).status).toBe(403);
    expect((await routes.network.GET(request("GET"), params())).status).toBe(403);
    expect((await routes.dailyChecks.PUT(request("PUT", {}), params())).status).toBe(403);
    expect((await routes.dashboard.GET(request("GET"), params())).status).toBe(403);
    expect((await routes.kpis.GET(request("GET"), params())).status).toBe(403);
    expect((await routes.lookups.GET(request("GET"), params())).status).toBe(200);
  });

  it("keeps IT staff out of Settings", async () => {
    session.user = itStaff;
    expect((await routes.settingsKey.GET(request("GET"), params({ key: "sla" }))).status).toBe(403);
    expect((await routes.lists.POST(request("POST", {}), params())).status).toBe(403);
    expect((await routes.assets.GET(request("GET"), params())).status).toBe(200);
    expect((await routes.dashboard.GET(request("GET"), params())).status).toBe(200);
    expect((await routes.kpis.GET(request("GET"), params())).status).toBe(200);
    // Only training hours and ISO non-conformities are entered by hand.
    expect((await routes.kpis.PUT(request("PUT", { year: 2026, kpi: "tat", quarters: [1, 1, 1, 1] }), params())).status).toBe(400);
  });

  it("lets admins into Settings, and only for known keys", async () => {
    session.user = admin;
    expect((await routes.settingsKey.GET(request("GET"), params({ key: "sla" }))).status).toBe(200);
    expect((await routes.settingsKey.GET(request("GET"), params({ key: "secrets" }))).status).toBe(404);
    const invalid = await routes.settingsKey.PUT(request("PUT", { critical: -1 }), params({ key: "sla" }));
    expect(invalid.status).toBe(400);
  });
});

describe("tickets over HTTP", () => {
  it("returns only the caller's own tickets to an employee", async () => {
    session.user = employee;
    const res = await routes.tickets.GET(request("GET"), params());
    const rows = (await res.json()) as { requesterId: number }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.requesterId === employee.employeeId)).toBe(true);
  });

  it("reports someone else's ticket as not found", async () => {
    session.user = employee;
    const [other] = await db.select().from(s.tickets).where(ne(s.tickets.requesterId, employee.employeeId!)).limit(1);
    expect((await routes.ticket.GET(request("GET"), params({ id: String(other.id) }))).status).toBe(404);
    expect((await routes.ticket.GET(request("GET"), params({ id: "abc" }))).status).toBe(404);
  });

  it("validates a new ticket and returns the issues", async () => {
    session.user = employee;
    const bad = await routes.tickets.POST(request("POST", { type: "incident", subject: "" }), params());
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { issues: { path: string[] }[] };
    expect(body.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["subject", "description", "issueType"]));

    const good = await routes.tickets.POST(
      request("POST", { type: "incident", subject: "Printer offline", description: "The floor printer is offline.", issueType: "hardware", location: "jeddah" }),
      params(),
    );
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ subject: "Printer offline", requesterId: employee.employeeId });
  });

  it("refuses a status move the workflow does not allow", async () => {
    session.user = itStaff;
    const [open] = await db.select().from(s.tickets).where(eq(s.tickets.status, "open")).limit(1);
    const res = await routes.ticket.PATCH(request("PATCH", { status: "closed" }), params({ id: String(open.id) }));
    expect(res.status).toBe(400);
  });
});

describe("conflicts", () => {
  it("answers 409 to a duplicate relationship", async () => {
    session.user = itStaff;
    const [rel] = await db.select().from(s.relationships).limit(1);
    const res = await routes.relationships.POST(
      request("POST", { sourceId: rel.sourceId, targetId: rel.targetId, type: rel.type }),
      params(),
    );
    expect(res.status).toBe(409);
  });

  it("answers 400 to a relationship pointing at nothing", async () => {
    session.user = itStaff;
    const res = await routes.relationships.POST(request("POST", { sourceId: 1, targetId: 99_999, type: "depends_on" }), params());
    expect(res.status).toBe(400);
  });
});

describe("network over HTTP", () => {
  it("serves the network status and the daily checklist to IT staff", async () => {
    session.user = itStaff;
    const status = await routes.network.GET(request("GET"), params());
    expect(status.status).toBe(200);
    expect((await status.json()).devices.length).toBeGreaterThan(30);

    const checklist = await routes.dailyChecks.GET(new Request("http://localhost/api/daily-checks?date=2026-09-28"), params());
    expect((await checklist.json()).items).toHaveLength(15);
    expect((await routes.dailyChecks.GET(new Request("http://localhost/api/daily-checks?date=yesterday"), params())).status).toBe(400);
  });

  it("answers 404 for devices and alerts that do not exist", async () => {
    session.user = itStaff;
    expect((await routes.check.POST(request("POST"), params({ id: "99999" }))).status).toBe(404);
    expect((await routes.acknowledge.POST(request("POST"), params({ id: "99999" }))).status).toBe(404);
  });
});
