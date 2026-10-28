import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Drawing } from "@/server/services/floor-plans";
import { createTestDb } from "./helpers/db";
import { floorPlanPdf } from "./helpers/floor-plan-pdf";
import { floorPlanSvg } from "./helpers/floor-plan-svg";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));
process.env.UPLOADS_DIR = await mkdtemp(path.join(tmpdir(), "ap-it-uploads-"));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const plans = await import("@/server/services/floor-plans");

let it_: Awaited<ReturnType<typeof asUser>>;
let switchId: number;
let laptopId: number;
let pdf: Uint8Array;
beforeAll(async () => {
  await seedDemo(NOW);
  it_ = await asUser("it@applus.test");
  [{ id: switchId }, { id: laptopId }] = await db.select({ id: s.assets.id }).from(s.assets).limit(2);
  pdf = await floorPlanPdf([{ p: "P1-1", s: "S1-1", x: 200, y: 200 }]);
}, 120_000);

const read = (panel: number | null, panelPort: number | null, switchNo: number | null, switchPort: number | null, x = 0.5, y = 0.5, written = "") => ({ panel, panelPort, switchNo, switchPort, x, y, written });
const drawing = (outlets: ReturnType<typeof read>[] | null, bytes = pdf): Drawing => ({
  file: { name: "Ground floor.pdf", bytes },
  page: { width: 595.32, height: 841.92 },
  mark: { width: 10, height: 9 },
  outlets,
});
const storageKey = async (id: number) => (await db.select().from(s.floorPlans).where(eq(s.floorPlans.id, id)))[0].storageKey;

describe("floor plans", () => {
  it("adds a plan with the outlets read from its drawing, and says what to look at", async () => {
    const { id } = await plans.createPlan("Ground floor", drawing([read(5, 18, 4, 42, 0.4, 0.3), read(5, 18, 4, 43, 0.6, 0.3), read(3, 7, 3, 7, 0.5, 0.7, "P3-7 / S3-7`")]), it_);
    const plan = await plans.getPlan(id);
    expect(plan).toMatchObject({ name: "Ground floor", fileName: "Ground floor.pdf", pageWidth: 595.32 });
    expect(plan).not.toHaveProperty("storageKey");
    expect(plan.outlets.map((o) => o.problems)).toEqual([["duplicatePanelPort"], ["duplicatePanelPort"], ["written"]]);
    expect(plan.switches.map((w) => [w.number, w.ports, w.asset])).toEqual([
      [3, 1, null],
      [4, 2, null],
    ]);
    expect(plan.panels).toEqual([3, 5]);
    expect((await plans.listPlans()).find((p) => p.id === id)).toMatchObject({ outlets: 3 });
    const file = await plans.planDrawing(id);
    expect(Buffer.from(file.bytes).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("refuses what is not a PDF, and keeps nothing of it", async () => {
    await expect(plans.createPlan("Bad", drawing([], new TextEncoder().encode("<html></html>")), it_)).rejects.toThrow("fileType");
    await expect(plans.createPlan("Bad", { ...drawing([]), page: { width: 0, height: 10 } }, it_)).rejects.toThrow("pageSize");
    await expect(plans.createPlan("", drawing([]), it_)).rejects.toThrow();
    expect((await plans.listPlans()).some((p) => p.name === "Bad")).toBe(false);
  });

  it("links switch numbers to assets, and shows their status", async () => {
    const { id } = await plans.createPlan("First floor", drawing([read(1, 1, 2, 1)]), it_);
    await plans.updatePlan(id, { name: "First floor", switches: { "2": switchId } }, it_);
    const plan = await plans.getPlan(id);
    expect(plan.switches).toEqual([{ number: 2, ports: 1, asset: expect.objectContaining({ id: switchId, monitorStatus: expect.any(String) }) }]);
    await expect(plans.updatePlan(id, { name: "First floor", switches: { "2": 999_999 } }, it_)).rejects.toThrow();
    expect((await plans.assetOnPlans(switchId)).asSwitch).toEqual([{ planId: id, planName: "First floor", switchNo: 2 }]);
  });

  it("adds, changes and removes outlets by hand, and finds the device plugged into one", async () => {
    const { id } = await plans.createPlan("Annex", drawing([]), it_);
    const outlet = await plans.createOutlet(id, { panel: 6, panelPort: 1, switchNo: 5, switchPort: 1, x: 0.2, y: 0.2, room: "Reception", assetId: null, note: "" }, it_);
    await plans.updateOutlet(outlet.id, { ...outlet, room: "Reception desk", assetId: laptopId }, it_);
    const plan = await plans.getPlan(id);
    expect(plan.outlets).toEqual([expect.objectContaining({ room: "Reception desk", assetId: laptopId, assetName: expect.any(String), problems: [] })]);
    expect((await plans.assetOnPlans(laptopId)).outlets).toEqual([expect.objectContaining({ planName: "Annex", panel: 6, panelPort: 1, switchNo: 5, switchPort: 1 })]);
    await expect(plans.createOutlet(id, { panel: 1, panelPort: 1, switchNo: null, switchPort: null, x: 2, y: 0, room: "", assetId: null, note: "" }, it_)).rejects.toThrow();
    await plans.deleteOutlet(outlet.id, it_);
    expect((await plans.getPlan(id)).outlets).toEqual([]);
  });

  it("a label corrected by hand is no longer one tidied from the drawing", async () => {
    const { id } = await plans.createPlan("Tidied", drawing([read(3, 7, 3, 7, 0.5, 0.5, "P3-7 / S3-7`")]), it_);
    const [outlet] = (await plans.getPlan(id)).outlets;
    await plans.updateOutlet(outlet.id, { ...outlet }, it_);
    expect((await plans.getPlan(id)).outlets[0]).toMatchObject({ written: "", problems: [] });
  });

  it("takes a new drawing, with its outlets or keeping the plan's, and lets the old one go", async () => {
    const { id } = await plans.createPlan("Redrawn", drawing([read(1, 1, 1, 1), read(1, 2, 1, 2)]), it_);
    const first = await storageKey(id);
    await plans.replaceDrawing(id, drawing(null), it_);
    expect((await plans.getPlan(id)).outlets).toHaveLength(2);
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, first))).toBe(false);
    await plans.replaceDrawing(id, drawing([read(2, 1, 2, 1)]), it_);
    expect((await plans.getPlan(id)).outlets.map((o) => o.panel)).toEqual([2]);
  });

  it("exports the outlets to Excel, panel by panel", async () => {
    const { id } = await plans.createPlan("Exported", drawing([read(5, 18, 4, 42), read(1, 3, 1, 3), read(1, 3, null, null)]), it_);
    await plans.updatePlan(id, { name: "Exported", switches: { "4": switchId } }, it_);
    const { name, bytes } = await plans.exportPlan(id);
    expect(name).toBe("Exported outlets.xlsx");
    const rows = await readSheet(Buffer.from(bytes));
    expect(rows[1]).toEqual(["Outlet", "Patch panel", "Panel port", "Switch", "Switch port", "Switch name", "Room", "Connected device", "Note", "To check"]);
    expect(rows.slice(2).map((r) => r[0])).toEqual(["P1-3 / S1-3", "P1-3", "P5-18 / S4-42"]);
    expect(rows[2][9]).toBe("Patch panel port on another outlet too");
    expect(rows[3][9]).toBe("Patch panel port on another outlet too; No switch label");
    expect(rows[4][5]).toEqual(expect.any(String));
  });

  it("deletes a plan with its outlets and its drawing", async () => {
    const { id } = await plans.createPlan("Gone", drawing([read(1, 1, 1, 1)]), it_);
    const key = await storageKey(id);
    await plans.deletePlan(id, it_);
    await expect(plans.getPlan(id)).rejects.toThrow();
    expect(await db.select().from(s.networkOutlets).where(eq(s.networkOutlets.planId, id))).toEqual([]);
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, key))).toBe(false);
  });
});

describe("SVG floor plans", () => {
  const svg = new TextEncoder().encode(floorPlanSvg([{ p: "P1-1", s: "S1-1", x: 140, y: 200 }]));
  const svgDrawing = (outlets: ReturnType<typeof read>[] | null, fit: number[] | null = null): Drawing => ({
    file: { name: "Office.svg", bytes: svg },
    page: { width: 200, height: 300 },
    mark: { width: 6, height: 5 },
    outlets,
    fit,
  });

  it("tells an SVG drawing by its content", () => {
    expect(plans.isSvg(svg)).toBe(true);
    expect(plans.isSvg(new TextEncoder().encode("\uFEFF  <svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBe(true);
    expect(plans.isSvg(new TextEncoder().encode("<html><svg></svg></html>"))).toBe(false);
    expect(plans.isSvg(new TextEncoder().encode('<?xml version="1.0"?><note/>'))).toBe(false);
  });

  it("adds a plan from an SVG, kept as one", async () => {
    const { id } = await plans.createPlan("Office 3D", svgDrawing([read(1, 1, 1, 1, 0.2, 0.33)]), it_);
    const plan = await plans.getPlan(id);
    expect(plan).toMatchObject({ format: "svg", fileName: "Office.svg", rack: null, layers: {} });
    const file = await plans.planDrawing(id);
    expect(file.format).toBe("svg");
    expect(new TextDecoder().decode(file.bytes)).toContain("<svg");
  });

  it("keeps the outlets and the rack, moved onto a new drawing, with what was entered for them", async () => {
    const { id } = await plans.createPlan("Moved", drawing([read(1, 1, 1, 1, 0.1, 0.2), read(2, 2, 2, 2, 0.5, 0.6)]), it_);
    const [first] = (await plans.getPlan(id)).outlets;
    await plans.updateOutlet(first.id, { ...first, room: "IT office" }, it_);
    await plans.updatePlan(id, { rack: { x: 0.4, y: 0.4 }, layers: { walls: "wall" } }, it_);
    // The new sheet holds the floor turned a quarter: x' = 0.2 + 0.5·y, y' = 0.9 - 0.6·x.
    await plans.replaceDrawing(id, svgDrawing(null, [0, 0.5, 0.2, -0.6, 0, 0.9]), it_);
    const plan = await plans.getPlan(id);
    expect(plan).toMatchObject({ format: "svg", layers: {} });
    expect(plan.rack!.x).toBeCloseTo(0.4);
    expect(plan.rack!.y).toBeCloseTo(0.66);
    const it1 = plan.outlets.find((o) => o.panel === 1)!;
    expect(it1).toMatchObject({ room: "IT office" });
    expect(it1.x).toBeCloseTo(0.3);
    expect(it1.y).toBeCloseTo(0.84);
    await expect(plans.replaceDrawing(id, svgDrawing(null, [1, 2, 3]), it_)).rejects.toThrow("fit");
  });

  it("changes only what is given: the rack, the layers, the name", async () => {
    const { id } = await plans.createPlan("Partly", svgDrawing([]), it_);
    await plans.updatePlan(id, { rack: { x: 0.25, y: 0.75 } }, it_);
    await plans.updatePlan(id, { layers: { fire: "wall", DOOR: "flat" } }, it_);
    expect(await plans.getPlan(id)).toMatchObject({ name: "Partly", rack: { x: 0.25, y: 0.75 }, layers: { fire: "wall", DOOR: "flat" } });
    await expect(plans.updatePlan(id, { rack: { x: 2, y: 0 } }, it_)).rejects.toThrow();
    await expect(plans.updatePlan(id, { layers: { fire: "roof" as "wall" } }, it_)).rejects.toThrow();
  });
});
