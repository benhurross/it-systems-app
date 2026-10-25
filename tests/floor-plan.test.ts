import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { outletMatches, outletProblems, pageTexts, panelLabel, readLabel, readOutlets, switchLabel, type PlanText } from "@/lib/floor-plan";
import { floorPlanPdf } from "./helpers/floor-plan-pdf";

const text = (t: string, x: number, y: number, width = 6, height = 3): PlanText => ({ text: t, x, y, width, height });
const page = { width: 600, height: 800 };

describe("reading a port label", () => {
  it("reads the panel or switch and the port", () => {
    expect(readLabel("P5-18")).toMatchObject({ kind: "P", unit: 5, port: 18, cleaned: false });
    expect(readLabel("s4 - 42")).toMatchObject({ kind: "S", unit: 4, port: 42 });
  });

  it("reads digits a drawing's font keeps under other codes", () => {
    // As the office's plan has them: "1" and "5" under 0x12 and 0x16.
    expect(readLabel("P4-\u0012")).toMatchObject({ unit: 4, port: 1, written: "P4-1" });
    expect(readLabel("S4-4\u0016")).toMatchObject({ unit: 4, port: 45 });
  });

  it("tidies a stray mark after a label, and says so", () => {
    expect(readLabel("S3-7`")).toMatchObject({ unit: 3, port: 7, cleaned: true, written: "S3-7`" });
  });

  it("reads a label without its port number", () => {
    expect(readLabel("P4-")).toMatchObject({ unit: 4, port: null });
  });

  it("is not fooled by other text", () => {
    for (const t of ["S2", "SALES", "P4-12A", "PS-1", "3.71", "SERVER"]) expect(readLabel(t)).toBeNull();
  });
});

describe("reading the outlets on a page", () => {
  it("pairs each P label with the S label under it, at their middle", () => {
    const { outlets } = readOutlets([text("P5-18", 100, 100), text("S4-42", 100, 103.6), text("P4-20", 112, 100), text("S4-20", 112, 103.6)], page);
    expect(outlets.map((o) => [panelLabel(o), switchLabel(o)])).toEqual([
      ["P5-18", "S4-42"],
      ["P4-20", "S4-20"],
    ]);
    expect(outlets[0].x).toBeCloseTo(103 / 600);
    expect(outlets[0].y).toBeCloseTo(103.3 / 800);
  });

  it("keeps a label with no pair as an outlet with one end", () => {
    const { outlets } = readOutlets([text("P1-1", 100, 100), text("S1-9", 300, 300)], page);
    expect(outlets).toHaveLength(2);
    expect(outlets[0]).toMatchObject({ panel: 1, panelPort: 1, switchNo: null });
    expect(outlets[1]).toMatchObject({ panel: null, switchNo: 1, switchPort: 9 });
  });

  it("puts back together a label drawn in pieces", () => {
    const { outlets } = readOutlets([text("P4-", 100, 100, 5), text("12", 105.2, 100, 3), text("S4-12", 100, 103.6)], page);
    expect(outlets).toEqual([expect.objectContaining({ panel: 4, panelPort: 12, switchNo: 4, switchPort: 12 })]);
  });

  it("notes a label tidied to be read", () => {
    const { outlets } = readOutlets([text("P3-7", 100, 100), text("S3-7`", 100, 103.6)], page);
    expect(outlets[0]).toMatchObject({ switchPort: 7, written: "P3-7 / S3-7`" });
  });

  it("reads them from a PDF, leaving out what is not an outlet", async () => {
    const bytes = await floorPlanPdf([
      { p: "P1-1", s: "S1-1", x: 200, y: 200 },
      { p: "P1-2", s: "S1-14", x: 212, y: 200 },
      { p: "P2-1", s: "S2-1", x: 300, y: 500 },
    ]);
    const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    const { texts, size } = await pageTexts(await doc.getPage(1), pdfjs as never);
    expect(size.width).toBeCloseTo(595.32);
    const { outlets, mark } = readOutlets(texts, size);
    expect(outlets.map((o) => `${panelLabel(o)} ${switchLabel(o)}`)).toEqual(["P1-1 S1-1", "P1-2 S1-14", "P2-1 S2-1"]);
    // Where they were drawn: P's baseline 200 points down, S's 3.6 below it.
    expect(outlets[0].y * size.height).toBeGreaterThan(197);
    expect(outlets[0].y * size.height).toBeLessThan(204);
    expect(mark.height).toBeGreaterThan(5);
  });
});

describe("what to look at", () => {
  const o = (panel: number | null, panelPort: number | null, switchNo: number | null, switchPort: number | null, written = "") => ({ panel, panelPort, switchNo, switchPort, written });

  it("finds ports given to two outlets, missing ends and numbers, tidied labels", () => {
    expect(outletProblems([o(1, 1, 1, 1), o(1, 1, 1, 2), o(2, 1, 1, 2), o(null, null, 3, 1), o(4, null, 4, 2), o(5, 1, null, null, "P5-1`")])).toEqual([
      ["duplicatePanelPort"],
      ["duplicatePanelPort", "duplicateSwitchPort"],
      ["duplicateSwitchPort"],
      ["noPanel"],
      ["noPort"],
      ["noSwitch", "written"],
    ]);
  });

  it("finds an outlet by label, by switch, by room or by device", () => {
    const outlet = { ...o(5, 18, 4, 42), room: "IT Manager", device: "LT-0042" };
    expect(outletMatches(outlet, "P5-18")).toBe(true);
    expect(outletMatches(outlet, "s4-42")).toBe(true);
    expect(outletMatches(outlet, "S4")).toBe(true);
    expect(outletMatches(outlet, "S4-4")).toBe(false);
    expect(outletMatches(outlet, "P4")).toBe(false);
    expect(outletMatches(outlet, "manager")).toBe(true);
    expect(outletMatches(outlet, "lt-0042")).toBe(true);
    expect(outletMatches(outlet, " ")).toBe(false);
  });
});
