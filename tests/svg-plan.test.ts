// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { panelLabel, switchLabel } from "@/lib/floor-plan";
import { carryOver, defaultRoles, fitOutlets, parseTransform, pathSegments, readSvgPlan } from "@/lib/svg-plan";
import { floorPlanSvg } from "./helpers/floor-plan-svg";

const parse = (text: string) => readSvgPlan(new DOMParser().parseFromString(text, "image/svg+xml"));

describe("reading SVG geometry", () => {
  it("reads transforms in order", () => {
    expect(parseTransform("translate(10 20)")).toEqual([1, 0, 0, 1, 10, 20]);
    expect(parseTransform("matrix(0 -1 1 0 0 842)")).toEqual([0, -1, 1, 0, 0, 842]);
    const turned = parseTransform("translate(5,5) rotate(90)");
    expect(turned.map((n) => Math.round(n * 1000) / 1000)).toEqual([0, 1, -1, 0, 5, 5]);
    expect(parseTransform(null)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("turns paths into straight pieces, curves in steps", () => {
    expect(pathSegments("M0 0L10 0L10 5Z")).toEqual([0, 0, 10, 0, 10, 0, 10, 5, 10, 5, 0, 0]);
    expect(pathSegments("m1 1 h4 v2")).toEqual([1, 1, 5, 1, 5, 1, 5, 3]);
    const curve = pathSegments("M0 0C0 10 10 10 10 0");
    expect(curve).toHaveLength(32);
    expect(curve.slice(-2)).toEqual([10, 0]);
  });
});

describe("reading an SVG plan", () => {
  const svg = floorPlanSvg([
    { p: "P1-1", s: "S1-1", x: 140, y: 200 },
    { p: "P1-2", s: "S1-2", x: 150, y: 200 },
    { p: "P2-3", s: "S2-7", x: 250, y: 300 },
  ]);
  const plan = parse(svg);

  it("takes its size from the view box, and its layers' lines after every transform", () => {
    expect([plan.width, plan.height]).toEqual([200, 300]);
    expect(plan.layers.map((l) => l.name)).toEqual(["fire", "DOOR"]);
    const walls = plan.layers[0].segments;
    // The outer wall runs round (10, 10) to (190, 290) in the plan's units, the sheet left out.
    const xs = walls.filter((_, i) => i % 2 === 0);
    const ys = walls.filter((_, i) => i % 2 === 1);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(Math.round)).toEqual([10, 190, 10, 290]);
  });

  it("reads the outlets from their labels, where they are", () => {
    expect(plan.outlets.map((o) => `${panelLabel(o)} ${switchLabel(o)}`)).toEqual(["P1-1 S1-1", "P1-2 S1-2", "P2-3 S2-7"]);
    expect(plan.outlets[0].x).toBeCloseTo(0.2 + 0.01, 1);
    expect(plan.outlets[0].y).toBeCloseTo(0.333, 1);
  });

  it("reads room names level, one name over two lines as one, numbers left out", () => {
    expect(plan.rooms.map((r) => r.text)).toEqual(["SERVER", "PROJECT MANAGER"]);
    expect(plan.rooms[0].x).toBeCloseTo(0.18, 1);
    expect(plan.rooms[0].y).toBeCloseTo(0.117, 1);
  });

  it("raises the layer with the most lines as walls, doors flat", () => {
    expect(defaultRoles(plan.layers)).toEqual({ fire: "wall", DOOR: "flat" });
    expect(defaultRoles([{ name: "A-GLAZ-CURT", segments: [] }, { name: "x", segments: [1, 2, 3, 4] }])).toEqual({ "A-GLAZ-CURT": "glass", x: "wall" });
  });

  it("refuses what is not an SVG", () => {
    expect(() => parse("<html><body></body></html>")).toThrow();
  });
});

describe("putting a plan's outlets onto a new drawing", () => {
  const o = (panel: number, panelPort: number, switchNo: number, switchPort: number, x: number, y: number) => ({ panel, panelPort, switchNo, switchPort, x, y });
  const old = [o(1, 1, 1, 1, 0.1, 0.1), o(1, 2, 1, 2, 0.5, 0.1), o(2, 1, 2, 1, 0.1, 0.9), o(2, 2, 2, 2, 0.5, 0.9), o(3, 1, 3, 1, 0.3, 0.5), o(3, 1, 3, 1, 0.4, 0.5)];
  // The same floor, turned a quarter and squeezed into another sheet.
  const moved = old.map((p) => ({ ...p, x: 0.2 + p.y * 0.5, y: 0.9 - p.x * 0.6 }));

  it("finds the move from the outlets labelled once on each", () => {
    const fit = fitOutlets(old, moved)!;
    expect(fit.matched).toBe(4);
    expect(fit.error).toBeLessThan(1e-9);
    const [a, b, c, d, e, f] = fit.matrix;
    expect([a, b, c, d, e, f].map((n) => Math.round(n * 1000) / 1000)).toEqual([0, 0.5, 0.2, -0.6, 0, 0.9]);
  });

  it("needs four outlets labelled alike", () => {
    expect(fitOutlets(old.slice(0, 3), moved.slice(0, 3))).toBeNull();
  });
});

describe("carrying what was entered over to a new drawing's outlets", () => {
  const o = (panel: number, panelPort: number, x: number, y: number, room = "", assetId: number | null = null) => ({ panel, panelPort, switchNo: panel, switchPort: panelPort, x, y, room, assetId, note: "" });
  it("matches by label, the nearest where a label is on two outlets", () => {
    const current = [o(1, 1, 0.1, 0.1, "Reception", 7), o(2, 2, 0.2, 0.2, "IT"), o(2, 2, 0.8, 0.8, "CEO"), o(3, 3, 0.5, 0.5, "Gone")];
    const at = (panel: number, x: number, y: number) => ({ panel, panelPort: panel, switchNo: panel, switchPort: panel, x, y });
    const read = [at(1, 0.12, 0.1), at(2, 0.79, 0.8), at(2, 0.21, 0.2), at(4, 0.3, 0.3)];
    const result = carryOver(current, read, null);
    expect(result.outlets.map((x) => [x.panel, x.room, x.assetId])).toEqual([
      [1, "Reception", 7],
      [2, "CEO", null],
      [2, "IT", null],
      [4, "", null],
    ]);
    expect([result.carried, result.lost]).toEqual([3, 1]);
  });
});
