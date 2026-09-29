import { createServer, type AddressInfo, type Server } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const { assets, users } = await import("@/server/db/schema");
const { pool, tcpProbe } = await import("@/server/monitor/probes");
const discovery = await import("@/server/services/discovery");

const actor = { id: "scanner", name: "Scan Tester" };
let server: Server;
let port: number;

async function listen(s: Server) {
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  return (s.address() as AddressInfo).port;
}

/** A port that was free a moment ago, so connecting to it is refused. */
async function closedPort() {
  const s = createServer();
  const free = await listen(s);
  await new Promise((resolve) => s.close(resolve));
  return free;
}

beforeAll(async () => {
  await db.insert(users).values({ ...actor, email: "scanner@applus.test" });
  server = createServer((socket) => socket.end());
  port = await listen(server);
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe("probes", () => {
  it("finds an open TCP port up and a closed one down", async () => {
    const open = await tcpProbe("127.0.0.1", port, 1000);
    expect(open.up).toBe(true);
    expect(open.latencyMs).toBeGreaterThanOrEqual(1);
    expect(await tcpProbe("127.0.0.1", await closedPort(), 1000)).toEqual({ up: false, latencyMs: null });
  });

  it("gives up on an address that never answers", async () => {
    expect(await tcpProbe("192.0.2.1", 80, 300)).toEqual({ up: false, latencyMs: null });
  });

  it("runs every item with no more than the limit in flight", async () => {
    let active = 0;
    let peak = 0;
    const done: number[] = [];
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      done.push(n);
      active--;
    });
    expect(done.toSorted()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });
});

describe("discovery", () => {
  it("sweeps 127.0.0.1/32 and finds this machine with the listening port open", async () => {
    const { run, sweep } = await discovery.startDiscovery("127.0.0.1/32", actor, [port]);
    expect(run).toMatchObject({ status: "running", total: 1, scanned: 0, startedBy: actor.id });
    await sweep();
    const result = await discovery.getDiscoveryRun(run.id);
    expect(result).toMatchObject({ status: "done", scanned: 1 });
    expect(result.finishedAt).not.toBeNull();
    expect(result.hosts).toEqual([
      expect.objectContaining({ ip: "127.0.0.1", openPorts: [port], state: "new", assetId: null, assetName: null }),
    ]);
    const [latest] = await discovery.listDiscoveryRuns();
    expect(latest).toMatchObject({ id: run.id, found: 1, startedByName: actor.name });
  }, 20_000);

  it("recognises a host already in the inventory", async () => {
    const [asset] = await db
      .insert(assets)
      .values({ name: "LOOPBACK", category: "server", type: "server", location: "jeddah", ipAddress: "127.0.0.1" })
      .returning();
    const { run, sweep } = await discovery.startDiscovery("127.0.0.1/32", actor, [port]);
    await sweep();
    const [host] = (await discovery.getDiscoveryRun(run.id)).hosts;
    expect(host).toMatchObject({ state: "registered", assetId: asset.id, assetName: "LOOPBACK" });
  }, 20_000);

  it("refuses ranges larger than a /24", async () => {
    await expect(discovery.startDiscovery("10.0.0.0/16", actor)).rejects.toMatchObject({ status: 400 });
  });
});
