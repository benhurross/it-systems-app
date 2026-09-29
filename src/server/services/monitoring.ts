import { and, asc, count, desc, eq, getTableColumns, gte, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { nextState, type MonitorSettings, type ProbeResult } from "@/lib/monitor";
import { audit, type Actor } from "../audit";
import type { SessionUser } from "../auth";
import { db } from "../db";
import { alerts, assets, monitorChecks, users } from "../db/schema";
import { badRequest, one } from "../http";
import { pingProbe, pool, tcpProbe } from "../monitor/probes";
import { getSetting } from "../settings";
import { createTicket } from "./tickets";

const CONCURRENCY = 16;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Devices that are checked: in service, with an address and a way to reach it. */
const monitored = and(ne(assets.monitorMethod, "none"), isNotNull(assets.ipAddress), ne(assets.status, "retired"));

type Device = typeof assets.$inferSelect;

function probe(device: Device, timeoutMs: number): Promise<ProbeResult> {
  return device.monitorMethod === "tcp"
    ? tcpProbe(device.ipAddress!, device.monitorPort!, timeoutMs)
    : pingProbe(device.ipAddress!, timeoutMs);
}

/** Probes one device and records the check, the device's new state, and any alert it opens or resolves. */
export async function checkDevice(device: Device, settings: MonitorSettings) {
  const result = await probe(device, settings.timeoutMs);
  const next = nextState({ status: device.monitorStatus, failures: device.monitorFailures }, result, settings.degradedMs);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(monitorChecks).values({ assetId: device.id, checkedAt: now, ...result });
    await tx
      .update(assets)
      .set({ monitorStatus: next.status, monitorFailures: next.failures, monitorLatencyMs: result.latencyMs, monitorCheckedAt: now })
      .where(eq(assets.id, device.id));
    if (next.resolve) {
      await tx
        .update(alerts)
        .set({ status: "resolved", resolvedAt: now })
        .where(and(eq(alerts.assetId, device.id), ne(alerts.status, "resolved")));
    }
    if (next.open) await tx.insert(alerts).values({ assetId: device.id, kind: next.open, openedAt: now });
  });
  return { ...result, status: next.status };
}

/** One round over every monitored device, a few at a time. */
export async function runChecks(settings: MonitorSettings) {
  const devices = await db.select().from(assets).where(monitored);
  await pool(devices, CONCURRENCY, async (device) => {
    await checkDevice(device, settings);
  });
}

/** Checks one device straight away, whatever the schedule. */
export async function checkNow(id: number) {
  const device = one(await db.select().from(assets).where(and(eq(assets.id, id), monitored)));
  return checkDevice(device, await getSetting("monitoring"));
}

export async function pruneHistory(retentionDays: number, now = new Date()) {
  await db.delete(monitorChecks).where(lt(monitorChecks.checkedAt, new Date(now.getTime() - retentionDays * DAY_MS)));
}

/** Every monitored device with its last 24 hours: availability, and average latency hour by hour. */
export async function networkStatus(now = new Date()) {
  const since = sql.raw(`'${new Date(now.getTime() - DAY_MS).toISOString()}'::timestamptz`);
  const hour = sql<number>`least(23, floor(extract(epoch from ${monitorChecks.checkedAt} - ${since}) / 3600))::int`;
  const [settings, devices, hours] = await Promise.all([
    getSetting("monitoring"),
    db
      .select({
        id: assets.id,
        name: assets.name,
        category: assets.category,
        location: assets.location,
        criticality: assets.criticality,
        ipAddress: assets.ipAddress,
        monitorMethod: assets.monitorMethod,
        monitorPort: assets.monitorPort,
        monitorStatus: assets.monitorStatus,
        monitorLatencyMs: assets.monitorLatencyMs,
        monitorCheckedAt: assets.monitorCheckedAt,
      })
      .from(assets)
      .where(monitored)
      .orderBy(asc(assets.name)),
    db
      .select({
        assetId: monitorChecks.assetId,
        hour,
        checks: count(),
        up: sql<number>`count(*) filter (where ${monitorChecks.up})`.mapWith(Number),
        latencyMs: sql<number | null>`round(avg(${monitorChecks.latencyMs}))::int`,
      })
      .from(monitorChecks)
      .where(gte(monitorChecks.checkedAt, sql`${since}`))
      .groupBy(monitorChecks.assetId, hour),
  ]);
  return {
    enabled: settings.enabled,
    intervalSeconds: settings.intervalSeconds,
    devices: devices.map((device) => {
      const mine = hours.filter((h) => h.assetId === device.id);
      const checks = mine.reduce((n, h) => n + h.checks, 0);
      return {
        ...device,
        availability: checks ? mine.reduce((n, h) => n + h.up, 0) / checks : null,
        history: Array.from({ length: 24 }, (_, i) => {
          const h = mine.find((x) => x.hour === i);
          return { latencyMs: h?.latencyMs ?? null, failed: h ? h.up < h.checks : false };
        }),
      };
    }),
  };
}

/** Open and acknowledged alerts, and those resolved in the last week. */
export async function listAlerts(now = new Date()) {
  return db
    .select({
      ...getTableColumns(alerts),
      assetName: assets.name,
      location: assets.location,
      acknowledgedByName: users.name,
    })
    .from(alerts)
    .innerJoin(assets, eq(assets.id, alerts.assetId))
    .leftJoin(users, eq(users.id, alerts.acknowledgedBy))
    .where(or(ne(alerts.status, "resolved"), gte(alerts.resolvedAt, new Date(now.getTime() - 7 * DAY_MS))))
    .orderBy(desc(alerts.openedAt), desc(alerts.id));
}

async function alertWithDevice(id: number) {
  return one(
    await db
      .select({ alert: alerts, device: assets })
      .from(alerts)
      .innerJoin(assets, eq(assets.id, alerts.assetId))
      .where(eq(alerts.id, id)),
  );
}

export async function acknowledgeAlert(id: number, actor: Actor) {
  const { alert, device } = await alertWithDevice(id);
  if (alert.status !== "open") throw badRequest("This alert is no longer open");
  const row = one(
    await db
      .update(alerts)
      .set({ status: "acknowledged", acknowledgedBy: actor.id, acknowledgedAt: new Date() })
      .where(eq(alerts.id, id))
      .returning(),
  );
  await audit(actor, "acknowledge", "alert", id, `Acknowledged the ${alert.kind} alert on ${device.name}`);
  return row;
}

/** Opens an incident for the alert's device, once: a second request returns the same ticket. */
export async function alertTicket(id: number, user: SessionUser) {
  const { alert, device } = await alertWithDevice(id);
  if (alert.ticketId) return { id: alert.ticketId };
  const ticket = await createTicket(user, {
    type: "incident",
    subject: alert.kind === "down" ? `${device.name} is down` : `${device.name} is responding slowly`,
    description: `Network monitoring raised this alert at ${alert.openedAt.toISOString()} for ${device.ipAddress} (${device.monitorMethod === "tcp" ? `TCP port ${device.monitorPort}` : "ping"}).`,
    issueType: "internet",
    location: device.location,
    priority: device.criticality,
    requesterId: user.employeeId ?? null,
    assigneeId: null,
    assetId: device.id,
  });
  await db.update(alerts).set({ ticketId: ticket.id }).where(eq(alerts.id, id));
  return { id: ticket.id };
}
