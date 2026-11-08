import { isoDate } from "./dates";

/** The quarter a moment falls in, in the app's time zone, with its year. */
export function quarterOf(at: Date | string): { year: number; quarter: number } {
  const [year, month] = isoDate(at).split("-").map(Number);
  return { year, quarter: Math.ceil(month / 3) };
}

const FREQUENCY_AR: Record<string, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
  quarterly: "ربع سنوي",
  "semi-annually": "نصف سنوي",
  "semi-annual": "نصف سنوي",
  "half-yearly": "نصف سنوي",
  yearly: "سنوي",
  annually: "سنوي",
  annual: "سنوي",
};

/**
 * How often a KPI is measured, for its badge: the register's wording (Monthly / Quarterly), in
 * Arabic where its words are known ones; when the register gives none, from how its figures are
 * entered, each month or each quarter.
 */
export function kpiFrequency(kpi: { frequency: string; period: "month" | "quarter" }, locale: string) {
  const words = kpi.frequency.trim() || (kpi.period === "quarter" ? "Quarterly" : "Monthly");
  if (locale !== "ar") return words;
  return words.replace(/[A-Za-z][A-Za-z-]*/g, (w) => FREQUENCY_AR[w.toLowerCase()] ?? w);
}
