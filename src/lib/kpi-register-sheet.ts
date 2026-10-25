import type { KpiLevel, KpiPeriod, KpiSource, KpiUnit } from "./domain";

/**
 * Reading a KPI register kept in Excel, in the Master KPI Register's layout: a header row naming
 * KPI ID, KPI Name, Baseline, Target, Weight % and the months, then one KPI per row. The year is
 * the one written above the header ("Weight % 2026").
 */

export type SheetCell = string | number | boolean | Date | null | undefined;

export const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"] as const;

const COLUMNS = {
  code: ["kpiid", "id", "code"],
  level: ["level"],
  department: ["department"],
  role: ["roleappliesto", "role", "appliesto"],
  name: ["kpiname", "name", "kpi"],
  definition: ["definition"],
  formula: ["calculationformula", "calculation"],
  direction: ["measurementdirection", "direction"],
  frequency: ["frequency"],
  dataSource: ["primarydatasource", "datasource", "source"],
  reviewer: ["reviewer"],
  baseline: ["baseline"],
  target: ["target"],
  weight: ["weight", "weightpercent"],
  notes: ["notes"],
  redFlag: ["redflagescalationtrigger", "redflag", "escalationtrigger"],
  // The register's "Formula" column holds what is said about the baseline.
  baselineNote: ["formula", "baselinenote"],
} as const;
type Field = keyof typeof COLUMNS;

export type RegisterRow = {
  line: number;
  code: string;
  name: string;
  level: KpiLevel;
  department: string;
  role: string;
  definition: string;
  formula: string;
  higherIsBetter: boolean;
  frequency: string;
  period: KpiPeriod;
  unit: KpiUnit;
  source: KpiSource;
  dataSource: string;
  reviewer: string;
  baseline: number | null;
  baselineNote: string;
  target: number | null;
  weight: number | null;
  notes: string;
  redFlag: string;
  /** The months that have a figure, 1 to 12, as written. */
  months: { month: number; value: number }[];
  problems: ("noCode" | "noName" | "target")[];
};

const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
const text = (c: SheetCell) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c)).replace(/\r\n/g, "\n").trim();
const number = (c: SheetCell) => {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const t = text(c).replace(/,/g, "");
  const m = /^(-?\d+(?:\.\d+)?)\s*(%)?$/.exec(t);
  return m ? Number(m[1]) / (m[2] ? 100 : 1) : null;
};

function levelOf(v: string): KpiLevel {
  const k = key(v);
  if (k.includes("manager")) return "manager";
  if (k.includes("employee") || k.includes("staff")) return "employee";
  return "department";
}

export function readKpiRegister(sheet: SheetCell[][], fallbackYear: number) {
  const headerAt = sheet.findIndex((row) => row.some((c) => key(text(c)) === "kpiid"));
  if (headerAt < 0) return { year: fallbackYear, rows: [] as RegisterRow[], problem: "noHeader" as const };
  const header = sheet[headerAt].map((c) => key(text(c)));
  const at: Partial<Record<Field, number>> = {};
  for (const [field, names] of Object.entries(COLUMNS) as [Field, readonly string[]][]) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) at[field] = i;
  }
  const monthAt = header.flatMap((h, i) => {
    const m = MONTHS.findIndex((name) => h === name || (h.length === 3 && name.startsWith(h)));
    return m >= 0 ? [{ month: m + 1, column: i }] : [];
  });
  // The year written above the header, as "Weight % 2026"; this year otherwise.
  const above = sheet.slice(0, headerAt).flat().map(text).join(" ");
  const year = Number(/\b(20\d{2})\b/.exec(above)?.[1] ?? fallbackYear);

  const rows = sheet
    .slice(headerAt + 1)
    .map((cells, i): RegisterRow | null => {
      const get = (f: Field) => (at[f] === undefined ? "" : text(cells[at[f]!]));
      const num = (f: Field) => (at[f] === undefined ? null : number(cells[at[f]!]));
      const code = get("code");
      const name = get("name");
      if (!code && !name) return null;
      const problems: RegisterRow["problems"] = [];
      if (!code) problems.push("noCode");
      if (!name) problems.push("noName");
      const target = num("target");
      if (target === null) problems.push("target");
      const baselineText = get("baseline");
      const baseline = num("baseline");
      const frequency = get("frequency");
      // Shares are written as fractions (0.95); a target above that is a count, hours or a score.
      const unit: KpiUnit = target === null || target <= 1.5 ? "percent" : "number";
      const weight = num("weight");
      const months = monthAt.flatMap(({ month, column }) => {
        const v = number(cells[column]);
        return v === null ? [] : [{ month, value: unit === "percent" && v > 1.5 ? v / 100 : v }];
      });
      const lowered = `${name} ${get("formula")}`.toLowerCase();
      return {
        line: headerAt + i + 2,
        code,
        name,
        level: levelOf(get("level")),
        department: get("department") || "IT",
        role: get("role"),
        definition: get("definition"),
        formula: get("formula"),
        higherIsBetter: !/lower/i.test(get("direction")),
        frequency,
        period: /quarter/i.test(frequency) && !/month/i.test(frequency) ? "quarter" : "month",
        unit,
        // Ticket SLA KPIs are worked out from the tickets; figures in the sheet still stand for their months.
        source: lowered.includes("ticket") && lowered.includes("sla") ? "ticket_sla" : "manual",
        dataSource: get("dataSource"),
        reviewer: get("reviewer"),
        baseline,
        baselineNote: [baseline === null ? baselineText : "", get("baselineNote")].filter(Boolean).join("\n"),
        target,
        weight: weight === null ? null : weight <= 1 ? weight * 100 : weight,
        notes: get("notes"),
        redFlag: get("redFlag"),
        months,
        problems,
      };
    })
    .filter((r): r is RegisterRow => r !== null);
  return { year, rows, problem: null };
}
