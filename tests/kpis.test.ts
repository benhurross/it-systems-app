import { describe, expect, it } from "vitest";
import { achievement, type KpiDef, type KpiTicket, kpiResult, periodOf, rag, weightedScore } from "@/lib/kpi-register";

// Noon in Riyadh on 29 September 2026: September and the third quarter are under way.
const NOW = new Date("2026-09-29T09:00:00Z");
const at = (iso: string) => new Date(`${iso}T09:00:00Z`);
const ticket = (t: Partial<KpiTicket>): KpiTicket => ({
  type: "incident", issueType: "email", assigneeId: null, dueAt: at("2026-01-11"), resolvedAt: null, closedAt: null, satisfaction: null, documented: true, ...t,
});
const kpi = (k: Partial<KpiDef>): KpiDef => ({ id: 1, unit: "percent", period: "month", source: "manual", filter: {}, higherIsBetter: true, targetFor: "period", ...k });
const settings = { baseline: 0.89, baselineNote: "", target: 0.95, weight: 50 };

const tickets = [
  // January: one on time, one late. February: on time, but by the security team and undocumented.
  ticket({ dueAt: at("2026-01-12"), resolvedAt: at("2026-01-11"), closedAt: at("2026-01-12"), satisfaction: 5, assigneeId: "omar" }),
  ticket({ dueAt: at("2026-01-12"), resolvedAt: at("2026-01-15"), closedAt: at("2026-01-16"), satisfaction: 3 }),
  ticket({ dueAt: at("2026-02-03"), resolvedAt: at("2026-02-02"), issueType: "security", documented: false }),
  // September: still open past its deadline; one not due yet.
  ticket({ dueAt: at("2026-09-02") }),
  ticket({ dueAt: at("2026-09-30") }),
  // Last year: never counted.
  ticket({ dueAt: at("2025-12-02"), resolvedAt: at("2025-12-20"), closedAt: at("2025-12-21"), satisfaction: 1 }),
];

describe("a KPI's year", () => {
  it("works out the ticket SLA month by month, counted, and the year from the counts", () => {
    const r = kpiResult(kpi({ source: "ticket_sla" }), settings, [], tickets, 2026, NOW);
    expect(r.cells).toHaveLength(12);
    expect(r.cells[0]).toMatchObject({ numerator: 1, denominator: 2, value: 0.5, from: "tickets", started: true });
    expect(r.cells[1]).toMatchObject({ numerator: 1, denominator: 1, value: 1 });
    expect(r.cells[2]).toMatchObject({ value: null, from: null });
    // October has not begun.
    expect(r.cells[9]).toMatchObject({ started: false, value: null });
    expect(r.year).toBeCloseTo(2 / 3);
    // Judged on the latest month with a figure: February's 100%.
    expect(r).toMatchObject({ judged: 1, status: "green", achievement: 1 });
  });

  it("counts only the tickets a KPI names, and asks for a resolution note when it says so", () => {
    const officer = kpiResult(kpi({ source: "ticket_sla", filter: { assigneeId: "omar" } }), settings, [], tickets, 2026, NOW);
    expect(officer.cells[0]).toMatchObject({ numerator: 1, denominator: 1 });
    expect(officer.cells[1].value).toBeNull();
    const incidents = kpiResult(kpi({ source: "ticket_sla", filter: { issueType: "security", documented: true } }), settings, [], tickets, 2026, NOW);
    expect(incidents.cells[1]).toMatchObject({ numerator: 0, denominator: 1, value: 0 });
  });

  it("lets what IT staff entered stand in place of what the tickets say, notes and all", () => {
    const entered = [
      { period: 1, numerator: 48, denominator: 50, value: null, note: "From the Excel log" },
      { period: 2, numerator: null, denominator: null, value: null, note: "System went live" },
    ];
    const r = kpiResult(kpi({ source: "ticket_sla" }), settings, entered, tickets, 2026, NOW);
    expect(r.cells[0]).toMatchObject({ value: 0.96, from: "entered", note: "From the Excel log" });
    // A note alone explains the figure worked out.
    expect(r.cells[1]).toMatchObject({ value: 1, from: "tickets", note: "System went live" });
    expect(r.year).toBeCloseTo(49 / 51);
  });

  it("averages shares entered without counts, adds up hours, and judges a yearly target on the year", () => {
    const shares = kpiResult(kpi({}), settings, [
      { period: 7, numerator: null, denominator: null, value: 0.9991, note: "" },
      { period: 8, numerator: null, denominator: null, value: 0.9975, note: "" },
    ], [], 2026, NOW);
    expect(shares.year).toBeCloseTo(0.9983);
    const training = kpiResult(kpi({ unit: "hours", period: "quarter", targetFor: "year" }), { baseline: 0, baselineNote: "", target: 150, weight: null }, [
      { period: 1, numerator: null, denominator: null, value: 42, note: "" },
      { period: 2, numerator: null, denominator: null, value: 38, note: "" },
    ], [], 2026, NOW);
    expect(training.cells).toHaveLength(4);
    expect(training).toMatchObject({ year: 80, judged: 80, status: "amber" });
    expect(training.achievement).toBeCloseTo(80 / 150);
  });

  it("counts SLA breaches and averages ratings for the quarter", () => {
    const breaches = kpiResult(kpi({ source: "sla_breaches", unit: "number", period: "quarter", higherIsBetter: false }), { baseline: 16, baselineNote: "", target: 8, weight: null }, [], tickets, 2026, NOW);
    expect(breaches.cells.map((c) => c.value)).toEqual([1, 0, 1, null]);
    const rating = kpiResult(kpi({ source: "satisfaction", unit: "score", period: "quarter" }), { baseline: 3.5, baselineNote: "", target: 4.5, weight: null }, [], tickets, 2026, NOW);
    expect(rating.cells[0].value).toBe(4);
    expect(rating.status).toBe("amber");
  });
});

describe("status, achievement and score", () => {
  it("is green at target, amber past the baseline or without one, red at or behind it", () => {
    expect(rag(true, 0.96, settings)).toBe("green");
    expect(rag(true, 0.9, settings)).toBe("amber");
    expect(rag(true, 0.89, settings)).toBe("red");
    expect(rag(true, 0.5, { baseline: null, target: 0.9 })).toBe("amber");
    expect(rag(false, 0, { baseline: 2, target: 0 })).toBe("green");
    expect(rag(true, null, settings)).toBe("none");
  });

  it("measures how far toward its target a figure is, either way", () => {
    expect(achievement(true, 0.475, 0.95)).toBeCloseTo(0.5);
    expect(achievement(true, 2, 1)).toBe(1);
    expect(achievement(false, 16, 8)).toBe(0.5);
    expect(achievement(false, 0, 0)).toBe(1);
    expect(achievement(false, 1, 0)).toBe(0);
  });

  it("weights each KPI as set, leaving out those without a weight or a figure yet", () => {
    expect(weightedScore([{ weight: 60, achievement: 1 }, { weight: 40, achievement: 0.5 }, { weight: null, achievement: 0 }])).toEqual({ score: 0.8, weighted: 100, total: 100 });
    expect(weightedScore([{ weight: 60, achievement: null }, { weight: 40, achievement: 1 }])).toEqual({ score: 1, weighted: 40, total: 100 });
    expect(weightedScore([]).score).toBeNull();
  });

  it("places a moment in its month and quarter in Riyadh time", () => {
    expect(periodOf("2026-06-30T22:00:00Z", "month")).toEqual({ year: 2026, period: 7 });
    expect(periodOf("2026-06-30T22:00:00Z", "quarter")).toEqual({ year: 2026, period: 3 });
  });
});
