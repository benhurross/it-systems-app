import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatHours,
  formatNumber,
  formatPercent,
  formatRelative,
  formatTime,
} from "@/lib/format";

const noon = new Date("2026-09-29T09:00:00Z"); // 12:00 in Riyadh

describe("format", () => {
  it("formats dates in the Riyadh time zone", () => {
    expect(formatDate("2026-09-28T22:30:00Z", "en")).toBe("29 Sept 2026");
    expect(formatDateTime(noon, "en")).toBe("29 Sept 2026, 12:00");
    expect(formatTime(noon, "en")).toBe("12:00");
    expect(formatTime(noon, "ar")).not.toMatch(/[٠-٩]/);
  });

  it("uses the Gregorian calendar and Latin digits in Arabic", () => {
    const date = formatDate(noon, "ar");
    expect(date).toContain("2026");
    expect(date).toMatch(/سبتمبر/);
    expect(date).not.toMatch(/[٠-٩]/);
    expect(formatNumber(1234567, "ar")).toBe("1,234,567");
  });

  it("formats Saudi riyals without halalas", () => {
    expect(formatCurrency(22320, "en")).toBe("SAR 22,320");
    expect(formatCurrency(22320, "ar")).toContain("22,320");
  });

  it("formats ratios as percentages", () => {
    expect(formatPercent(0.9, "en")).toBe("90%");
    expect(formatPercent(0.8622, "en")).toBe("86.2%");
  });

  it("picks minutes, hours or days for a span", () => {
    expect(formatHours(0.5, "en")).toBe("30m");
    expect(formatHours(5, "en")).toBe("5h");
    expect(formatHours(72, "en")).toBe("3d");
    expect(formatHours(-2, "en")).toBe("-2h");
  });

  it("describes times relative to now", () => {
    expect(formatRelative(new Date(noon.getTime() + 3 * 3600_000), noon, "en")).toBe("in 3 hours");
    expect(formatRelative(new Date(noon.getTime() - 2 * 86400_000), noon, "en")).toBe("2 days ago");
    expect(formatRelative(noon, noon, "en")).toBe("now");
  });
});
