import { count, eq, isNotNull, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { seedDemo } = await import("@/server/seed/demo");
const { NOW } = await import("./helpers/seeded");
const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { assetsReport, clearAssets } = await import("@/server/seed/clear-assets");

const n = async (table: PgTable, where?: SQL) => (await db.select({ n: count() }).from(table).where(where))[0].n;

beforeAll(async () => {
  await seedDemo(NOW);
}, 120_000);

describe("emptying the asset list", () => {
  it("reports first, then deletes every asset and what hangs off them, keeping the rest unlinked", async () => {
    const before = { tickets: await n(s.tickets), linked: await n(s.tickets, isNotNull(s.tickets.assetId)), employees: await n(s.employees), licenses: await n(s.licenses) };
    expect(before.linked).toBeGreaterThan(0);
    const report = await assetsReport();
    expect(report.removed.find(([k]) => k === "assets")![1]).toBe(await n(s.assets));
    expect(report.unlinked.find(([k]) => k === "tickets")![1]).toBe(before.linked);

    await clearAssets();
    expect(await n(s.assets)).toBe(0);
    for (const t of [s.assetMovements, s.relationships, s.licenseInstalls, s.monitorChecks, s.alerts]) expect(await n(t)).toBe(0);
    expect(await n(s.attachments, eq(s.attachments.entity, "asset"))).toBe(0);
    // What stands on its own stays, only its link cleared.
    expect(await n(s.tickets)).toBe(before.tickets);
    expect(await n(s.tickets, isNotNull(s.tickets.assetId))).toBe(0);
    expect(await n(s.employees)).toBe(before.employees);
    expect(await n(s.licenses)).toBe(before.licenses);
    // Numbering, and so the tags, start again at 1.
    const [first] = await db.insert(s.assets).values({ name: "First real asset", category: "end_user", type: "laptop", location: "jeddah", status: "in_use" }).returning({ id: s.assets.id });
    expect(first.id).toBe(1);
  });
});
