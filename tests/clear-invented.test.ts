import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { count, isNotNull } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { assetInput } from "@/lib/schemas";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));
process.env.UPLOADS_DIR = await mkdtemp(path.join(tmpdir(), "ap-it-uploads-"));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const { createAsset } = await import("@/server/services/assets");
const { addAttachment } = await import("@/server/services/attachments");
const { clearInvented, inventedReport } = await import("@/server/seed/clear-invented");

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
const rows = async (table: Parameters<typeof db.$count>[0]) => db.$count(table);
let before: { employees: number; users: number; tickets: number; comments: number };
let realId: number;

beforeAll(async () => {
  await seedDemo(NOW);
  const it_ = await asUser("it@applus.test");
  // A laptop IT added in the app after the demo was loaded, with an invoice; and one on a demo asset.
  const real = await createAsset(
    assetInput.parse({ name: "LT-REAL-01", category: "end_user", type: "laptop", status: "in_use", location: "jeddah", supportStatus: "supported", criticality: "low", monitorMethod: "none", anydeskId: "123456789" }),
    it_,
  );
  realId = real.id;
  await addAttachment({ entity: "asset", entityId: realId, kind: "invoice", name: "real.pdf", bytes: PDF }, it_);
  const [demo] = await db.select({ id: s.assets.id }).from(s.assets).limit(1);
  await addAttachment({ entity: "asset", entityId: demo.id, kind: "invoice", name: "demo.pdf", bytes: PDF }, it_);
  before = { employees: await rows(s.employees), users: await rows(s.users), tickets: await rows(s.tickets), comments: await rows(s.ticketComments) };
}, 120_000);

describe("clearing what the demo made up", () => {
  it("reports what it would remove, and what added in the app it would keep, changing nothing", async () => {
    const report = await inventedReport();
    const assets = report.find((r) => r.name === "assets")!;
    expect(assets.kept).toBe(1);
    expect(assets.total).toBeGreaterThan(100);
    expect(report.find((r) => r.name === "vendors")!.total).toBeGreaterThan(0);
    expect(await rows(s.assets)).toBe(assets.total);
  });

  it("removes the made-up records and their documents, keeping people, tickets and what was added", async () => {
    const linked = await db.$count(s.tickets, isNotNull(s.tickets.assetId));
    expect(linked).toBeGreaterThan(0);
    const { removed, files } = await clearInvented();
    expect(removed.assets).toBeGreaterThan(100);
    expect(files).toBe(1);

    expect((await db.select({ id: s.assets.id, name: s.assets.name }).from(s.assets))).toEqual([{ id: realId, name: "LT-REAL-01" }]);
    for (const table of [s.vendors, s.licenses, s.contracts, s.purchases, s.budgets, s.projects, s.projectTasks, s.risks, s.vulnerabilities, s.changes, s.kbArticles, s.discoveryRuns, s.assetMovements, s.relationships, s.licenseInstalls]) {
      expect(await rows(table)).toBe(0);
    }
    // Only the real laptop's monitoring and its invoice are left.
    const [{ n: checks }] = await db.select({ n: count() }).from(s.monitorChecks);
    expect(checks).toBe(0);
    expect((await db.select({ name: s.attachments.name }).from(s.attachments))).toEqual([{ name: "real.pdf" }]);
    expect((await readdir(process.env.UPLOADS_DIR!, { recursive: true, withFileTypes: true })).filter((f) => f.isFile())).toHaveLength(1);

    expect({ employees: await rows(s.employees), users: await rows(s.users), tickets: await rows(s.tickets), comments: await rows(s.ticketComments) }).toEqual(before);
    // Tickets keep their place, without the made-up device.
    expect(await db.$count(s.tickets, isNotNull(s.tickets.assetId))).toBe(0);
    expect(await rows(s.lookups)).toBeGreaterThan(0);

    // Run again, there is nothing left to take.
    const again = await clearInvented();
    expect(Object.values(again.removed).every((n) => n === 0)).toBe(true);
  });
});
