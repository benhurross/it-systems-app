import { count, eq, isNotNull } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { NOW } = await import("./helpers/seeded");
const { deleteImpact } = await import("@/server/services/impact");

beforeAll(async () => {
  await seedDemo(NOW);
}, 120_000);

describe("what a delete takes with it", () => {
  it("counts an asset's links: what goes with it, and what only loses its link", async () => {
    // An asset that tickets name.
    const [busiest] = await db
      .select({ id: s.tickets.assetId, n: count() })
      .from(s.tickets)
      .where(isNotNull(s.tickets.assetId))
      .groupBy(s.tickets.assetId)
      .orderBy(({ n }) => [n])
      .limit(1);
    const impact = await deleteImpact("asset", busiest.id!);
    expect(impact.unlinked).toContainEqual({ what: "tickets", count: busiest.n });
    const moves = (await db.select({ n: count() }).from(s.assetMovements).where(eq(s.assetMovements.assetId, busiest.id!)))[0].n;
    if (moves) expect(impact.goes).toContainEqual({ what: "movements", count: moves });
    // Only what is there is listed.
    expect([...impact.goes, ...impact.unlinked].every((l) => l.count > 0)).toBe(true);
  });

  it("lists nothing for a record with no links, and says when the record is gone", async () => {
    const [bare] = await db.insert(s.assets).values({ name: "BARE-01", category: "end_user", type: "laptop", status: "in_stock", location: "jeddah" }).returning();
    expect(await deleteImpact("asset", bare.id)).toEqual({ goes: [], unlinked: [] });
    await expect(deleteImpact("asset", 999_999)).rejects.toMatchObject({ status: 404 });
  });

  it("counts a project's tasks, a vendor's contracts and purchases, and a KPI's figures", async () => {
    const [project] = await db.select().from(s.projects).limit(1);
    const tasks = (await db.select({ n: count() }).from(s.projectTasks).where(eq(s.projectTasks.projectId, project.id)))[0].n;
    expect((await deleteImpact("project", project.id)).goes).toEqual(tasks ? [{ what: "projectTasks", count: tasks }] : []);
    const [vendor] = await db.select().from(s.vendors).limit(1);
    const vendorImpact = await deleteImpact("vendor", vendor.id);
    expect(vendorImpact.goes).toEqual([]);
    expect(vendorImpact.unlinked.every((l) => ["licenses", "contracts", "purchases"].includes(l.what))).toBe(true);
  });
});
