import { createServer, type AddressInfo, type Server } from "node:net";
import { and, eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const monitoring = await import("@/server/services/monitoring");
const daily = await import("@/server/services/daily-checks");
const { getSetting } = await import("@/server/settings");

const servers: Server[] = [];
let it_: Awaited<ReturnType<typeof asUser>>;

/** A local TCP listener, standing in for a device's open port. */
async function listen() {
  const server = createServer((socket) => socket.end());
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

const close = (server: Server) => new Promise((resolve) => server.close(resolve));
const deviceNamed = async (name: string) => (await db.select().from(s.assets).where(eq(s.assets.name, name)))[0];
const alertsOn = (assetId: number) => db.select().from(s.alerts).where(eq(s.alerts.assetId, assetId));

beforeAll(async () => {
  await seedDemo(NOW);
  it_ = await asUser("it@applus.test");
}, 120_000);

afterAll(() => Promise.all(servers.map((server) => server.listening && close(server))));

describe("network status", () => {
  it("summarises each device's last day hour by hour", async () => {
    const status = await monitoring.networkStatus(NOW);
    expect(status).toMatchObject({ enabled: false, intervalSeconds: 60 });
    const byName = (name: string) => status.devices.find((d) => d.name === name)!;

    const dc = byName("DC01");
    expect(dc).toMatchObject({ monitorStatus: "up", availability: 1 });
    expect(dc.history).toHaveLength(24);
    expect(dc.history.every((h) => !h.failed && h.latencyMs !== null)).toBe(true);

    // AP-RYD-03 stopped answering two hours ago: 12 of its 144 checks failed.
    const ap = byName("AP-RYD-03");
    expect(ap.monitorStatus).toBe("down");
    expect(ap.availability).toBeCloseTo(132 / 144);
    expect(ap.history[23]).toEqual({ latencyMs: null, failed: true });
    expect(ap.history[0].failed).toBe(false);

    expect(byName("PRN-RYD-01").monitorStatus).toBe("degraded");
    expect(status.devices.some((d) => d.name === "LT-001")).toBe(false);
  });

  it("lists open, acknowledged and recently resolved alerts, newest first", async () => {
    const list = await monitoring.listAlerts(NOW);
    expect(list.map((a) => [a.assetName, a.status])).toEqual([
      ["PRN-RYD-01", "acknowledged"],
      ["AP-RYD-03", "open"],
      ["FW-RYD-01", "resolved"],
      ["SW-JED-FL2", "resolved"],
    ]);
    expect(list[0].acknowledgedByName).toBe("Joseph Mathew");
    // A week later only the unresolved ones remain.
    expect(await monitoring.listAlerts(new Date(NOW.getTime() + 8 * 86_400_000))).toHaveLength(2);
  });
});

describe("alerts", () => {
  it("acknowledges an open alert once", async () => {
    const [alert] = await alertsOn((await deviceNamed("AP-RYD-03")).id);
    const acknowledged = await monitoring.acknowledgeAlert(alert.id, it_);
    expect(acknowledged).toMatchObject({ status: "acknowledged", acknowledgedBy: it_.id });
    await expect(monitoring.acknowledgeAlert(alert.id, it_)).rejects.toMatchObject({ status: 400 });
    const [entry] = await db.select().from(s.auditLog).where(eq(s.auditLog.entity, "alert"));
    expect(entry.summary).toBe("Acknowledged the down alert on AP-RYD-03");
  });

  it("opens one incident for an alert's device", async () => {
    const device = await deviceNamed("AP-RYD-03");
    const [alert] = await alertsOn(device.id);
    const { id } = await monitoring.alertTicket(alert.id, it_);
    const [ticket] = await db.select().from(s.tickets).where(eq(s.tickets.id, id));
    expect(ticket).toMatchObject({
      type: "incident",
      subject: "AP-RYD-03 is down",
      assetId: device.id,
      priority: "medium",
      location: "riyadh",
      requesterId: it_.employeeId,
    });
    expect(await monitoring.alertTicket(alert.id, it_)).toEqual({ id });
    expect((await alertsOn(device.id))[0].ticketId).toBe(id);
  });
});

describe("checks", () => {
  it("calls a device down after two failed checks and resolves the alert when it recovers", async () => {
    const { server, port } = await listen();
    const [device] = await db
      .insert(s.assets)
      .values({ name: "PROBE", category: "servers", type: "physical_server", location: "jeddah", ipAddress: "127.0.0.1", monitorMethod: "tcp", monitorPort: port })
      .returning();

    expect(await monitoring.checkNow(device.id)).toMatchObject({ up: true, status: "up" });
    expect(await deviceNamed("PROBE")).toMatchObject({ monitorStatus: "up", monitorFailures: 0 });

    await close(server);
    expect(await monitoring.checkNow(device.id)).toMatchObject({ up: false, status: "up" });
    expect(await alertsOn(device.id)).toHaveLength(0);
    expect(await monitoring.checkNow(device.id)).toMatchObject({ up: false, status: "down" });
    expect(await alertsOn(device.id)).toEqual([expect.objectContaining({ kind: "down", status: "open" })]);

    // Back on another port: up again, and the alert is closed.
    await db.update(s.assets).set({ monitorPort: (await listen()).port }).where(eq(s.assets.id, device.id));
    expect(await monitoring.checkNow(device.id)).toMatchObject({ up: true, status: "up" });
    expect((await alertsOn(device.id))[0]).toMatchObject({ status: "resolved" });
    expect(await db.select().from(s.monitorChecks).where(eq(s.monitorChecks.assetId, device.id))).toHaveLength(4);
  }, 30_000);

  it("refuses to check a device that is not monitored", async () => {
    await expect(monitoring.checkNow((await deviceNamed("LT-001")).id)).rejects.toMatchObject({ status: 404 });
  });

  it("checks every monitored device in service in one round", async () => {
    const { port } = await listen();
    await db.update(s.assets).set({ monitorMethod: "none" }).where(ne(s.assets.name, "PROBE"));
    const [retired] = await db
      .insert(s.assets)
      .values({ name: "OLD", category: "servers", type: "physical_server", location: "jeddah", status: "retired", ipAddress: "127.0.0.1", monitorMethod: "tcp", monitorPort: port })
      .returning();
    const before = (await deviceNamed("PROBE")).monitorCheckedAt!;
    await monitoring.runChecks(await getSetting("monitoring"));
    expect((await deviceNamed("PROBE")).monitorCheckedAt!.getTime()).toBeGreaterThan(before.getTime());
    expect((await deviceNamed("OLD")).monitorCheckedAt).toBeNull();
    expect(await db.select().from(s.monitorChecks).where(eq(s.monitorChecks.assetId, retired.id))).toHaveLength(0);
  }, 30_000);

  it("prunes history older than the retention window", async () => {
    const device = await deviceNamed("DC01");
    await db.insert(s.monitorChecks).values({ assetId: device.id, checkedAt: new Date(NOW.getTime() - 40 * 86_400_000), up: true, latencyMs: 3 });
    const count = async () => (await db.select().from(s.monitorChecks).where(eq(s.monitorChecks.assetId, device.id))).length;
    expect(await count()).toBe(145);
    await monitoring.pruneHistory(30, NOW);
    expect(await count()).toBe(144);
  });
});

describe("daily checks", () => {
  it("records who ticked each item, day by day", async () => {
    const today = "2026-09-29";
    const before = await daily.dailyChecklist(today);
    expect(before).toHaveLength(15);
    expect(before.filter((c) => c.done)).toHaveLength(8);
    expect(before.find((c) => c.item === "wifi")).toMatchObject({ done: false, checkedByName: null });

    await daily.recordDailyCheck({ date: today, item: "wifi", done: true, note: "All access points up" }, it_);
    const after = await daily.dailyChecklist(today);
    expect(after.find((c) => c.item === "wifi")).toMatchObject({ done: true, note: "All access points up", checkedByName: "Omar Haddad" });

    const history = await daily.dailyHistory();
    expect(history).toHaveLength(14);
    expect(history[0]).toEqual({ date: today, done: 9 });
    expect(history[1].done).toBe(15);
    const [row] = await db.select().from(s.dailyChecks).where(and(eq(s.dailyChecks.date, today), eq(s.dailyChecks.item, "wifi")));
    expect(row.checkedBy).toBe(it_.id);
  });
});
