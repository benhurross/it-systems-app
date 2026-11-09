import readXlsxFile from "read-excel-file/node";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { seedReference } = await import("@/server/seed/reference");
const { assetTemplate } = await import("@/server/services/asset-template");
const { planImport, TEMPLATE_HEADERS } = await import("@/lib/asset-import");
const { db } = await import("@/server/db");
const { lookups } = await import("@/server/db/schema");

beforeAll(async () => {
  await seedReference();
}, 60_000);

describe("the asset import template", () => {
  it("has every column the import reads, the lists' values, and an example row that loads", async () => {
    const sheets = await readXlsxFile(Buffer.from(await assetTemplate()));
    expect(sheets.map((s) => s.sheet)).toEqual(["Assets", "Lists", "How to fill"]);
    const [assets, lists, how] = sheets.map((s) => s.data.map((r) => r.map((c) => (c === null ? "" : String(c)))));
    expect(assets[0]).toEqual([...TEMPLATE_HEADERS]);
    expect(assets).toHaveLength(1);
    const column = (name: string) => lists.slice(1).map((r) => r[lists[0].indexOf(name)]).filter(Boolean);
    expect(column("Type")).toContain("Laptop");
    expect(column("Processor")).toEqual(expect.arrayContaining(["Intel Core i7", "AMD Ryzen 5", "Apple M2"]));
    expect(column("Operating system")).toContain("Windows 11 Pro");
    expect(column("Storage type")).toEqual(expect.arrayContaining(["SSD (NVMe)", "HDD"]));
    expect(lists[0]).not.toContain("Ports");

    // The example on "How to fill", put on the Assets sheet, loads without a problem.
    const at = how.findIndex((r) => r[0] === "Tag");
    const ctx = { lookups: await db.select().from(lookups), employees: [{ id: 1, name: "Test Person", email: "employee@applus.com.sa", number: null, active: true }], assets: [] };
    const { rows, unused, added } = planImport([how[at], how[at + 1]], ctx);
    expect(unused).toEqual([]);
    expect(added).toEqual([]);
    expect(rows[0]).toMatchObject({ action: "add", problems: [] });
    expect(rows[0].input!.specs).toMatchObject({ cpu: "intel_core_i7", ramGb: 16, os: "win11_pro", drives: [{ size: 512, unit: "GB", type: "ssd_nvme" }] });
  });
});
