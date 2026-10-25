import { readSheet } from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const { importKpiRegister, exportKpiRegister } = await import("@/server/services/kpi-sheet");
const { kpiRegister, setKpiFigure } = await import("@/server/services/kpis");
const tokens = await import("@/server/services/api-tokens");
const publicKpis = await import("@/app/api/public/kpis/route");

let admin: Awaited<ReturnType<typeof asUser>>;
beforeAll(async () => {
  await seedDemo(NOW);
  admin = await asUser("admin@applus.test");
  // Targets set for 2025 in Settings before the register, as on a database from before it.
  const { db } = await import("@/server/db");
  const { settings } = await import("@/server/db/schema");
  const old = { baseline: 0, target: 0 };
  await db.insert(settings).values({
    key: "kpi_targets",
    value: { 2025: { tat: { baseline: 0.7, target: 0.92 }, complaints: { baseline: 20, target: 10 }, training_hours: old, iso_ncs: old, satisfaction: { baseline: 3, target: 4 } } },
  });
}, 120_000);

describe("setting up the register on a database from before it", () => {
  it("takes the targets set for each year in Settings", async () => {
    const tat = (year: number) => kpiRegister(year, NOW).then(({ rows }) => rows.find((r) => r.code === "IT-TAT")!.settings);
    expect(await tat(2025)).toMatchObject({ year: 2025, baseline: 0.7, target: 0.92 });
    // This year, not set in Settings, keeps the workbook's targets, as it had.
    expect(await tat(2026)).toMatchObject({ year: 2026, baseline: 0.68, target: 0.9 });
  });
});

/** A register in the layout the IT department keeps, with made-up KPIs. */
async function register(rows: (string | number | null)[][]) {
  const header = [
    "KPI ID", "Level", "Department", "Role / Applies To", "KPI Name", "Definition", "Calculation / Formula", "Measurement Direction", "Frequency",
    "Primary Data Source", "Reviewer", "Baseline", "Target", "Weight %", "July", "August", "Notes", "Red Flag / Escalation Trigger", "KPI Configurations", "Formula",
  ];
  const bytes = await writeXlsxFile([["Master KPI Register"], [null, null, null, null, null, null, null, null, null, null, null, null, null, "Weight % 2026"], header, ...rows] as never).toBuffer();
  return { name: "register.xlsx", bytes: new Uint8Array(bytes) };
}
const rowOf = (code: string, name: string, extra: Partial<Record<"baseline" | "target" | "weight" | "july" | "august" | "frequency" | "role", string | number | null>> = {}) => [
  code, "Employee", "IT / Cybersecurity", extra.role ?? "Cyber Security Officer", name, "What it measures.", "Done ÷ planned.", "Higher is better", extra.frequency ?? "Monthly",
  "Tracker", "IT Manager", extra.baseline ?? "N/A : To be established after implementation", extra.target ?? 0.9, extra.weight ?? null, extra.july ?? null, extra.august ?? null,
  "From the tracker", "Below 80%", "system", "Set after the first cycle.",
];

describe("loading the KPI register from Excel", () => {
  it("checks first, then adds what is new and brings up to date what is there", async () => {
    const file = await register([
      rowOf("3-IT-CYB-01", "Patch Compliance", { july: 1, august: 0.95, weight: 0.3 }),
      rowOf("3-IT-CYB-02", "Backup Recovery Test Evidence", { frequency: "Quarterly", july: 1, august: 0.9 }),
      rowOf("3-IT-OFF-09", "IT Ticket Resolution SLA", { role: "IT Officer", baseline: 0.89, target: 0.95, july: 0.9865 }),
      ["", "Employee", "IT", "IT Officer", "A KPI without an ID", "", "", "", "", "", "", "", "", "", "", ""],
      rowOf("3-IT-CYB-01", "Patch Compliance again"),
    ]);
    const dry = await importKpiRegister(file, false, admin);
    expect(dry).toMatchObject({ applied: false, year: 2026, counts: { add: 3, update: 0, skip: 2 } });
    expect(dry.rows.map((r) => [r.code, r.action, r.problems])).toEqual([
      ["3-IT-CYB-01", "add", []],
      ["3-IT-CYB-02", "add", []],
      ["3-IT-OFF-09", "add", []],
      ["", "skip", ["noCode", "target"]],
      ["3-IT-CYB-01", "skip", ["repeated"]],
    ]);
    expect((await kpiRegister(2026, NOW)).rows.some((r) => r.code === "3-IT-CYB-01")).toBe(false);

    const loaded = await importKpiRegister(file, true, admin);
    expect(loaded.applied).toBe(true);
    const { rows } = await kpiRegister(2026, NOW);
    const patch = rows.find((r) => r.code === "3-IT-CYB-01")!;
    expect(patch).toMatchObject({ level: "employee", role: "Cyber Security Officer", period: "month", unit: "percent", source: "manual", redFlag: "Below 80%" });
    expect(patch.settings).toMatchObject({ baseline: null, target: 0.9, weight: 30 });
    expect(patch.settings.baselineNote).toContain("To be established");
    expect(patch.cells.slice(6, 8).map((c) => [c.value, c.from])).toEqual([[1, "entered"], [0.95, "entered"]]);
    // Kept by the quarter: July and August are both the third quarter, the latest standing.
    const tests = rows.find((r) => r.code === "3-IT-CYB-02")!;
    expect(tests).toMatchObject({ period: "quarter" });
    expect(tests.cells[2].value).toBe(0.9);
    // A ticket SLA KPI is worked out from tickets, its July figure from the sheet standing.
    const sla = rows.find((r) => r.code === "3-IT-OFF-09")!;
    expect(sla).toMatchObject({ source: "ticket_sla" });
    expect(sla.cells[6]).toMatchObject({ value: 0.9865, from: "entered" });

    // Loaded again with new figures: brought up to date, what the app added kept.
    await setKpiFigure(patch.id, { year: 2026, period: 9, numerator: 18, denominator: 20, value: null, note: "" }, admin);
    const again = await importKpiRegister(await register([rowOf("3-IT-CYB-01", "Patch Compliance", { august: 0.97, target: 0.92 })]), true, admin);
    expect(again.counts).toEqual({ add: 0, update: 1, skip: 0 });
    const updated = (await kpiRegister(2026, NOW)).rows.find((r) => r.code === "3-IT-CYB-01")!;
    expect(updated.settings.target).toBe(0.92);
    expect(updated.cells.slice(6, 9).map((c) => c.value)).toEqual([1, 0.97, 0.9]);
  });

  it("refuses what is not an Excel workbook, and says when there is no KPI ID column", async () => {
    await expect(importKpiRegister({ name: "x.xlsx", bytes: new TextEncoder().encode("not a workbook") }, false, admin)).rejects.toMatchObject({ status: 400 });
    const bytes = await writeXlsxFile([["Name", "Target"], ["Something", 1]] as never).toBuffer();
    expect(await importKpiRegister({ name: "y.xlsx", bytes: new Uint8Array(bytes) }, false, admin)).toMatchObject({ problem: "noHeader", rows: [] });
  });
});

describe("the register in Excel", () => {
  it("writes the year in the register's layout, months, status and each role's score", async () => {
    const workbook = await exportKpiRegister(2026, NOW);
    const sheet = (await readSheet(workbook)) as unknown[][];
    expect(sheet[0][0]).toBe("Master KPI Register — AP Plus");
    expect(sheet[2].slice(0, 5)).toEqual(["KPI ID", "Level", "Department", "Role / Applies To", "KPI Name"]);
    expect(sheet[2]).toContain("September");
    const training = sheet.find((r) => r[0] === "IT-TRAINING")!;
    expect(training[4]).toBe("IT training hours");
    // A quarter's figure sits in its last month: March, June, September.
    const march = sheet[2].indexOf("March");
    expect([training[march], training[march + 3], training[march + 6]]).toEqual([42, 38, 45]);
    expect(training).toContain("Improving");
    const scores = (await readSheet(workbook, "Scores")) as unknown[][];
    expect(scores[0]).toEqual(["Role", "Level", "Weighted score", "Weight with figures", "Weight set", "Q1 score", "Q2 score", "Q3 score", "Q4 score"]);
    // The quarters, beside the months: training hours by quarter.
    const q1 = sheet[2].indexOf("Q1");
    expect(training.slice(q1, q1 + 3)).toEqual([42, 38, 45]);
    expect(scores.some((r) => r[0] === "IT Manager")).toBe(true);
  });
});

describe("the KPIs for other systems", () => {
  const ask = (token?: string) => new Request("http://localhost/api/public/kpis?year=2026", { headers: token ? { authorization: `Bearer ${token}` } : {} });

  it("answers only with a key in use, and stops when it is revoked", async () => {
    expect((await publicKpis.GET(ask(), undefined)).status).toBe(401);
    expect((await publicKpis.GET(ask("apit_made-up"), undefined)).status).toBe(401);
    const made = await tokens.createApiToken("Board dashboard", admin);
    expect(made.token).toMatch(/^apit_/);
    const res = await publicKpis.GET(ask(made.token), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as { year: number; kpis: { code: string; figures: unknown[]; status: string }[]; roles: { role: string }[] };
    expect(body.year).toBe(2026);
    expect(body.kpis.find((k) => k.code === "IT-TRAINING")).toMatchObject({ status: "amber", figures: [{ period: 1, value: 42 }, { period: 2, value: 38 }, { period: 3, value: 45 }] });
    expect(body.roles.map((r) => r.role)).toContain("IT Manager");
    // One quarter, when asked.
    const third = (await (await publicKpis.GET(new Request("http://localhost/api/public/kpis?year=2026&quarter=3", { headers: { authorization: `Bearer ${made.token}` } }), undefined)).json()) as {
      quarter: number;
      kpis: { code: string; quarters: { quarter: number; value: number }[]; figures: { period: number }[] }[];
    };
    expect(third.quarter).toBe(3);
    const training = third.kpis.find((k) => k.code === "IT-TRAINING")!;
    expect(training.quarters).toEqual([expect.objectContaining({ quarter: 3, value: 45 })]);
    expect(training.figures.map((f) => f.period)).toEqual([3]);
    // Only the hash is kept; the list shows the start of the key and when it was last used.
    const [listed] = await tokens.listApiTokens();
    expect(listed).toMatchObject({ name: "Board dashboard", prefix: made.prefix, revokedAt: null });
    expect(listed.lastUsedAt).not.toBeNull();
    expect(JSON.stringify(listed)).not.toContain(made.token);
    await tokens.revokeApiToken(made.id, admin);
    expect((await publicKpis.GET(ask(made.token), undefined)).status).toBe(401);
  });
});
