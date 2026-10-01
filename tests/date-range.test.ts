import { describe, expect, it } from "vitest";
import { inDateRange, isEmptyRange, presetOf, presetRange } from "@/lib/date-range";

describe("date ranges", () => {
  it("works out each quick range from today", () => {
    const today = "2026-03-15";
    expect(presetRange("today", today)).toEqual({ from: "2026-03-15", to: "2026-03-15" });
    expect(presetRange("last7", today)).toEqual({ from: "2026-03-09", to: "2026-03-15" });
    expect(presetRange("last30", today)).toEqual({ from: "2026-02-14", to: "2026-03-15" });
    expect(presetRange("thisMonth", today)).toEqual({ from: "2026-03-01", to: "2026-03-15" });
    expect(presetRange("lastMonth", today)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("lastMonth", "2024-03-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(presetRange("lastMonth", "2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("thisYear", today)).toEqual({ from: "2026-01-01", to: "2026-03-15" });
    expect(presetRange("lastYear", today)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("names a range that is a quick range", () => {
    expect(presetOf({ from: "2026-03-01", to: "2026-03-15" }, "2026-03-15")).toBe("thisMonth");
    expect(presetOf({ from: "2026-03-02", to: "2026-03-15" }, "2026-03-15")).toBeNull();
    // On the 1st, today and this month are the same day: the one chosen keeps its name.
    expect(presetOf({ from: "2026-03-01", to: "2026-03-01" }, "2026-03-01")).toBe("today");
    expect(presetOf({ from: "2026-03-01", to: "2026-03-01", preset: "thisMonth" }, "2026-03-01")).toBe("thisMonth");
  });

  it("counts days by the office's calendar, ends included and either open", () => {
    // 00:30 on 15 March in Riyadh is still 14 March in UTC.
    expect(inDateRange("2026-03-14T21:30:00Z", { from: "2026-03-15", to: "2026-03-15" })).toBe(true);
    expect(inDateRange("2026-03-14T20:30:00Z", { from: "2026-03-15", to: "2026-03-15" })).toBe(false);
    expect(inDateRange(new Date("2026-03-20T09:00:00Z"), { from: "2026-03-15", to: null })).toBe(true);
    expect(inDateRange("2026-03-10T09:00:00Z", { from: null, to: "2026-03-09" })).toBe(false);
    // Ends given backwards still work.
    expect(inDateRange("2026-03-12T09:00:00Z", { from: "2026-03-15", to: "2026-03-10" })).toBe(true);
    expect(isEmptyRange({ from: null, to: null })).toBe(true);
    expect(isEmptyRange(undefined)).toBe(true);
    expect(isEmptyRange({ from: "2026-03-01", to: null })).toBe(false);
  });
});
