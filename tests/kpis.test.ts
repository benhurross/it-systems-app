import { describe, expect, it } from "vitest";
import { DEFAULT_KPI_TARGETS, kpiReport, type KpiRow } from "@/lib/kpis";

// Noon in Riyadh on 29 September 2026: the third quarter is under way, the fourth hasn't started.
const NOW = new Date("2026-09-29T09:00:00Z");
const at = (iso: string) => new Date(`${iso}T09:00:00Z`);
type Ticket = Parameters<typeof kpiReport>[0]["tickets"][number];
const ticket = (t: Partial<Ticket>): Ticket => ({
  createdAt: at("2026-01-10"),
  dueAt: at("2026-01-11"),
  resolvedAt: null,
  closedAt: null,
  satisfaction: null,
  ...t,
});
const row = (rows: KpiRow[], kpi: KpiRow["kpi"]) => rows.find((r) => r.kpi === kpi)!;

describe("KPI report", () => {
  const tickets = [
    // Q1: one on time, one late; both closed with ratings.
    ticket({ dueAt: at("2026-01-12"), resolvedAt: at("2026-01-11"), closedAt: at("2026-01-12"), satisfaction: 5 }),
    ticket({ dueAt: at("2026-01-12"), resolvedAt: at("2026-01-15"), closedAt: at("2026-01-16"), satisfaction: 3 }),
    // Q2: on time.
    ticket({ createdAt: at("2026-05-01"), dueAt: at("2026-05-02"), resolvedAt: at("2026-05-01"), closedAt: at("2026-05-02"), satisfaction: 4 }),
    // Q3: still open past its deadline, and one open that isn't due yet.
    ticket({ createdAt: at("2026-09-01"), dueAt: at("2026-09-02") }),
    ticket({ createdAt: at("2026-09-29"), dueAt: at("2026-09-30") }),
    // Last year: ignored.
    ticket({ createdAt: at("2025-12-01"), dueAt: at("2025-12-02"), resolvedAt: at("2025-12-20"), closedAt: at("2025-12-21"), satisfaction: 1 }),
  ];
  const entered = [
    { quarter: 1, kpi: "training_hours", value: 40 },
    { quarter: 2, kpi: "training_hours", value: 50 },
    { quarter: 1, kpi: "iso_ncs", value: 1 },
  ];
  const rows = kpiReport({ tickets, entered }, 2026, DEFAULT_KPI_TARGETS, NOW);

  it("lists the five KPIs with their baseline and target", () => {
    expect(rows.map((r) => r.kpi)).toEqual(["tat", "complaints", "training_hours", "iso_ncs", "satisfaction"]);
    expect(row(rows, "tat")).toMatchObject({ baseline: 0.68, target: 0.9 });
  });

  it("measures SLA, complaints and satisfaction per quarter from tickets, leaving unstarted quarters empty", () => {
    expect(row(rows, "tat").quarters).toEqual([0.5, 1, null, null]);
    expect(row(rows, "complaints").quarters).toEqual([1, 0, 1, null]);
    expect(row(rows, "satisfaction").quarters).toEqual([4, 4, null, null]);
  });

  it("takes the year so far as a share, a total or an average", () => {
    expect(row(rows, "tat").year).toBeCloseTo(2 / 3);
    expect(row(rows, "complaints").year).toBe(2);
    expect(row(rows, "satisfaction").year).toBe(4);
  });

  it("adds up entered figures over the year and leaves unrecorded quarters empty", () => {
    expect(row(rows, "training_hours")).toMatchObject({ quarters: [40, 50, null, null], year: 90 });
    expect(row(rows, "iso_ncs")).toMatchObject({ quarters: [1, null, null, null], year: 1 });
  });

  it("judges quarterly KPIs on their latest quarter, and the others on the year so far", () => {
    // Complaints: 1 in Q3 against a target of 8 per quarter.
    expect(row(rows, "complaints").status).toBe("green");
    // SLA: Q2 at 100% (Q3 has nothing resolved yet).
    expect(row(rows, "tat").status).toBe("green");
    // Training: 90 of 150 hours, past the baseline of 0.
    expect(row(rows, "training_hours").status).toBe("amber");
    // ISO: 1 non-conformity, better than the baseline of 2 but short of 0.
    expect(row(rows, "iso_ncs").status).toBe("amber");
  });

  it("shows a past year in full, and a future year as not started", () => {
    const past = kpiReport({ tickets, entered: [] }, 2025, DEFAULT_KPI_TARGETS, NOW);
    expect(row(past, "tat").quarters).toEqual([null, null, null, 0]);
    expect(row(past, "training_hours")).toMatchObject({ year: null, status: "none" });
    const future = kpiReport({ tickets, entered: [] }, 2027, DEFAULT_KPI_TARGETS, NOW);
    expect(future.every((r) => r.quarters.every((q) => q === null) && r.status === "none")).toBe(true);
  });
});
