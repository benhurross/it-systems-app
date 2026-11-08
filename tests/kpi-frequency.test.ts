import { describe, expect, it } from "vitest";
import { kpiFrequency, kpiFrequencyTone } from "@/lib/kpis";

describe("kpiFrequency", () => {
  it("shows the register's wording", () => {
    expect(kpiFrequency({ frequency: "Monthly / Quarterly", period: "month" }, "en")).toBe("Monthly / Quarterly");
  });

  it("falls back to how the figures are entered", () => {
    expect(kpiFrequency({ frequency: "", period: "month" }, "en")).toBe("Monthly");
    expect(kpiFrequency({ frequency: "  ", period: "quarter" }, "en")).toBe("Quarterly");
    expect(kpiFrequency({ frequency: "", period: "quarter" }, "ar")).toBe("ربع سنوي");
  });

  it("puts known words into Arabic and keeps the rest", () => {
    expect(kpiFrequency({ frequency: "Monthly / Quarterly", period: "month" }, "ar")).toBe("شهري / ربع سنوي");
    expect(kpiFrequency({ frequency: "Semi-annually", period: "month" }, "ar")).toBe("نصف سنوي");
    expect(kpiFrequency({ frequency: "Every sprint", period: "month" }, "ar")).toBe("Every sprint");
  });
});

describe("kpiFrequencyTone", () => {
  it("colours by the first measure named", () => {
    expect(kpiFrequencyTone({ frequency: "Monthly / Quarterly", period: "quarter" })).toBe("monthly");
    expect(kpiFrequencyTone({ frequency: "", period: "quarter" })).toBe("quarterly");
    expect(kpiFrequencyTone({ frequency: "", period: "month" })).toBe("monthly");
    expect(kpiFrequencyTone({ frequency: "Semi-annually", period: "month" })).toBe("yearly");
    expect(kpiFrequencyTone({ frequency: "Annual", period: "month" })).toBe("yearly");
    expect(kpiFrequencyTone({ frequency: "Weekly", period: "month" })).toBe("frequent");
    expect(kpiFrequencyTone({ frequency: "Every sprint", period: "month" })).toBe("other");
  });
});
