import { count, desc, eq, getTableColumns } from "drizzle-orm";
import { DISCOVERY_PORTS, expandCidr, reconcile } from "@/lib/discovery";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, discoveryHosts, discoveryRuns, users } from "../db/schema";
import { badRequest, one } from "../http";
import { arpTable, pingProbe, pool, reverseDns, tcpProbe } from "../monitor/probes";

const CONCURRENCY = 32;
const TIMEOUT_MS = 1500;

/**
 * Records a scan and returns it with the sweep still to run: the route hands the sweep to
 * `after()` so the request returns at once and the page follows progress.
 */
export async function startDiscovery(cidr: string, actor: Actor, ports: readonly number[] = DISCOVERY_PORTS) {
  let hosts: string[];
  try {
    hosts = expandCidr(cidr);
  } catch (error) {
    throw badRequest((error as Error).message);
  }
  const run = one(await db.insert(discoveryRuns).values({ cidr, total: hosts.length, startedBy: actor.id }).returning());
  await audit(actor, "scan", "discovery", run.id, `Scanned ${cidr}`);
  return { run, sweep: () => sweep(run.id, hosts, ports) };
}

async function sweep(runId: number, hosts: string[], ports: readonly number[]) {
  let scanned = 0;
  try {
    await pool(hosts, CONCURRENCY, async (ip) => {
      const [ping, ...open] = await Promise.all([pingProbe(ip, TIMEOUT_MS), ...ports.map((p) => tcpProbe(ip, p, TIMEOUT_MS))]);
      const openPorts = ports.filter((_, i) => open[i].up);
      if (ping.up || openPorts.length > 0) {
        await db.insert(discoveryHosts).values({
          runId,
          ip,
          hostname: await reverseDns(ip),
          openPorts,
          latencyMs: ping.latencyMs ?? open.find((p) => p.up)?.latencyMs ?? null,
        });
      }
      scanned++;
      if (scanned % 16 === 0) await db.update(discoveryRuns).set({ scanned }).where(eq(discoveryRuns.id, runId));
    });
    const macs = await arpTable();
    for (const host of await db.select().from(discoveryHosts).where(eq(discoveryHosts.runId, runId))) {
      const mac = macs.get(host.ip);
      if (mac) await db.update(discoveryHosts).set({ mac }).where(eq(discoveryHosts.id, host.id));
    }
    await db
      .update(discoveryRuns)
      .set({ status: "done", scanned: hosts.length, finishedAt: new Date() })
      .where(eq(discoveryRuns.id, runId));
  } catch (error) {
    await db
      .update(discoveryRuns)
      .set({ status: "failed", error: (error as Error).message, finishedAt: new Date() })
      .where(eq(discoveryRuns.id, runId));
  }
}

const found = db
  .select({ runId: discoveryHosts.runId, n: count().as("n") })
  .from(discoveryHosts)
  .groupBy(discoveryHosts.runId)
  .as("found");

export async function listDiscoveryRuns() {
  return db
    .select({ ...getTableColumns(discoveryRuns), startedByName: users.name, found: found.n })
    .from(discoveryRuns)
    .leftJoin(users, eq(users.id, discoveryRuns.startedBy))
    .leftJoin(found, eq(found.runId, discoveryRuns.id))
    .orderBy(desc(discoveryRuns.startedAt), desc(discoveryRuns.id))
    .limit(10);
}

/** One scan, each host marked registered, new, or registered under a changed address. */
export async function getDiscoveryRun(id: number) {
  const run = one(await db.select().from(discoveryRuns).where(eq(discoveryRuns.id, id)));
  const [hosts, inventory] = await Promise.all([
    db.select().from(discoveryHosts).where(eq(discoveryHosts.runId, id)).orderBy(discoveryHosts.id),
    db.select({ id: assets.id, name: assets.name, ipAddress: assets.ipAddress, macAddress: assets.macAddress }).from(assets),
  ]);
  return {
    ...run,
    hosts: hosts.map((host) => {
      const match = reconcile(host, inventory);
      return { ...host, ...match, assetName: inventory.find((a) => a.id === match.assetId)?.name ?? null };
    }),
  };
}
