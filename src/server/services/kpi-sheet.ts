import { inArray } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import writeXlsxFile, { type Cell, type Row } from "write-excel-file/node";
import { MONTHS, readKpiRegister, type SheetCell } from "@/lib/kpi-register-sheet";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { kpiFigures, kpis, kpiYears } from "../db/schema";
import { badRequest } from "../http";
import { ensureKpiRegister } from "../seed/kpi-defaults";
import { getSetting } from "../settings";
import { kpiRegister } from "./kpis";

/**
 * The register in and out of Excel. Loading a register adds the KPIs it lists and brings those
 * already in up to date (what they are, the year's baseline, target and weight, and the months'
 * figures it gives), keeping what the app adds: an owner, where a figure comes from, figures for
 * other months. It is checked first; nothing changes until it is loaded.
 */
export async function importKpiRegister(file: { name: string; bytes: Uint8Array }, apply: boolean, actor: Actor) {
  if (file.bytes.length === 0) throw badRequest("fileEmpty");
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw badRequest("fileSize");
  if (file.bytes[0] !== 0x50 || file.bytes[1] !== 0x4b) throw badRequest("fileType");
  let sheet: SheetCell[][];
  try {
    sheet = (await readSheet(Buffer.from(file.bytes))) as SheetCell[][];
  } catch {
    throw badRequest("fileType");
  }
  await ensureKpiRegister();
  const read = readKpiRegister(sheet, new Date().getFullYear());
  const codes = read.rows.map((r) => r.code).filter(Boolean);
  const existing = codes.length ? await db.select().from(kpis).where(inArray(kpis.code, codes)) : [];
  const seen = new Set<string>();
  const rows = read.rows.map((r) => {
    const problems: string[] = [...r.problems];
    if (r.code && seen.has(r.code)) problems.push("repeated");
    seen.add(r.code);
    const known = existing.find((k) => k.code === r.code);
    return { ...r, problems, action: problems.length ? ("skip" as const) : known ? ("update" as const) : ("add" as const), kpiId: known?.id ?? null };
  });
  const counts = { add: rows.filter((r) => r.action === "add").length, update: rows.filter((r) => r.action === "update").length, skip: rows.filter((r) => r.action === "skip").length };

  if (apply && !read.problem) {
    await db.transaction(async (tx) => {
      for (const [i, r] of rows.entries()) {
        if (r.action === "skip") continue;
        const described = {
          name: r.name,
          level: r.level,
          department: r.department,
          role: r.role,
          definition: r.definition,
          formula: r.formula,
          higherIsBetter: r.higherIsBetter,
          frequency: r.frequency,
          dataSource: r.dataSource,
          reviewer: r.reviewer,
          notes: r.notes,
          redFlag: r.redFlag,
        };
        let id = r.kpiId;
        if (id) await tx.update(kpis).set(described).where(inArray(kpis.id, [id]));
        else {
          const [made] = await tx
            .insert(kpis)
            .values({ code: r.code, ...described, period: r.period, unit: r.unit, source: r.source, sortOrder: 100 + i })
            .returning({ id: kpis.id });
          id = made.id;
          r.kpiId = id;
        }
        const year = { baseline: r.baseline, baselineNote: r.baselineNote, target: r.target!, weight: r.weight };
        await tx.insert(kpiYears).values({ kpiId: id, year: read.year, ...year }).onConflictDoUpdate({ target: [kpiYears.kpiId, kpiYears.year], set: year });
        // A KPI kept by the quarter takes the latest month given in each quarter.
        const period = (existing.find((k) => k.id === id)?.period ?? r.period) === "quarter" ? (m: number) => Math.ceil(m / 3) : (m: number) => m;
        const figures = new Map(r.months.map((m) => [period(m.month), m.value]));
        for (const [p, value] of figures) {
          await tx
            .insert(kpiFigures)
            .values({ kpiId: id, year: read.year, period: p, value, updatedBy: actor.name })
            .onConflictDoUpdate({ target: [kpiFigures.kpiId, kpiFigures.year, kpiFigures.period], set: { value, numerator: null, denominator: null, updatedBy: actor.name } });
        }
      }
    });
    await audit(actor, "import", "kpi", file.name, `Loaded the KPI register for ${read.year} from ${file.name}: ${counts.add} added, ${counts.update} updated`);
  }
  return {
    applied: apply && !read.problem,
    problem: read.problem,
    year: read.year,
    counts,
    rows: rows.map((r) => ({ line: r.line, code: r.code, name: r.name, role: r.role, action: r.action, kpiId: r.kpiId, months: r.months.map((m) => m.month), problems: r.problems })),
  };
}

const LEVELS = { department: "Department", manager: "Department Manager", employee: "Employee" } as const;
const STATUS = { green: "On target", amber: "Improving", red: "Off target", none: "No data" } as const;
const MONTH_NAMES = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));

/** A year's register as an Excel workbook, in the Master KPI Register's layout, with each role's score. */
export async function exportKpiRegister(year: number, now = new Date()) {
  const [{ rows, roles }, organisation] = await Promise.all([kpiRegister(year, now), getSetting("organisation")]);
  const bold = { fontWeight: "bold" as const };
  const head = (value: string): Cell => ({ value, ...bold, backgroundColor: "#DCE6F1", wrap: true, alignVertical: "top" });
  const wrapped = (value: string): Cell => (value ? { value, wrap: true, alignVertical: "top" } : null);
  const figure = (value: number | null, unit: string): Cell => (value === null ? null : unit === "percent" ? { value, type: Number, format: "0.00%" } : { value, type: Number, format: "0.##" });

  const header = [
    "KPI ID", "Level", "Department", "Role / Applies To", "KPI Name", "Definition", "Calculation / Formula", "Measurement Direction", "Frequency",
    "Primary Data Source", "Reviewer", "Baseline", "Target", "Weight %", ...MONTH_NAMES, "Year so far", "Status", "Notes", "Red Flag / Escalation Trigger",
  ];
  const register: Row[] = [
    [{ value: `Master KPI Register — ${organisation.name}`, ...bold, fontSize: 14 }],
    [{ value: `${year}`, ...bold }],
    header.map(head),
    ...rows
      .filter((r) => r.active)
      .map((r): Row => {
        // A KPI kept by the quarter shows each quarter's figure in its last month.
        const months = MONTH_NAMES.map((_, m) => {
          const cell = r.period === "month" ? r.cells[m] : (m + 1) % 3 === 0 ? r.cells[(m + 1) / 3 - 1] : undefined;
          return figure(cell?.value ?? null, r.unit);
        });
        return [
          r.code, LEVELS[r.level], r.department, r.role, r.name, wrapped(r.definition), wrapped(r.formula), r.higherIsBetter ? "Higher is better" : "Lower is better",
          r.frequency, wrapped(r.dataSource), r.reviewer,
          r.settings.baseline === null ? wrapped(r.settings.baselineNote) : figure(r.settings.baseline, r.unit),
          figure(r.settings.target, r.unit),
          r.settings.weight === null ? null : { value: r.settings.weight / 100, type: Number, format: "0%" },
          ...months,
          figure(r.year, r.unit), STATUS[r.status], wrapped(r.notes), wrapped(r.redFlag),
        ];
      }),
  ];
  const scores: Row[] = [
    ["Role", "Level", "Weighted score", "Weight with figures", "Weight set"].map(head),
    ...roles.map((r): Row => [
      r.role || "—", LEVELS[r.level],
      r.score === null ? null : { value: r.score, type: Number, format: "0.0%" },
      { value: r.weighted / 100, type: Number, format: "0%" },
      { value: r.total / 100, type: Number, format: "0%" },
    ]),
  ];
  const widths = [14, 18, 12, 20, 28, 40, 36, 16, 16, 24, 18, 12, 10, 10, ...MONTH_NAMES.map(() => 10), 12, 12, 40, 30].map((width) => ({ width }));
  return writeXlsxFile([
    { data: register, sheet: "KPI Register", columns: widths, stickyRowsCount: 3 },
    { data: scores, sheet: "Scores", columns: [24, 20, 16, 18, 12].map((width) => ({ width })) },
  ]).toBuffer();
}
