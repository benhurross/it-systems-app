import { asc, count, eq, inArray } from "drizzle-orm";
import writeXlsxFile, { type Row } from "write-excel-file/node";
import type { z } from "zod";
import { outletProblems, panelLabel, switchLabel, type OutletProblem } from "@/lib/floor-plan";
import { cleanFileName, MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";
import { floorPlanInput, outletInput, readOutletsInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, floorPlans, networkOutlets } from "../db/schema";
import { readStoredFile, removeStoredFile, storeFile } from "../files";
import { badRequest, notFound, one } from "../http";

/** A drawing as uploaded: the PDF or SVG, its page's size, the size of an outlet's mark, and the outlets read from it. */
export type Drawing = {
  file: { name: string; bytes: Uint8Array };
  page: { width: number; height: number };
  mark: { width: number; height: number };
  /** Null keeps the outlets the plan has: a new drawing of the same floor. */
  outlets: z.input<typeof readOutletsInput> | null;
  /**
   * With the outlets kept, the move that puts them onto the new drawing (x' = a·x + b·y + c,
   * y' = d·x + e·y + f, in fractions of each page), found from the outlets labelled alike on both.
   */
  fit?: number[] | null;
};

/** Whether the bytes are an SVG drawing: XML text whose root is an svg element. */
export function isSvg(bytes: Uint8Array) {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^\uFEFF/, "").trimStart();
  if (!/^<(\?xml|svg|!--|!DOCTYPE svg)/i.test(head)) return false;
  return /<svg[\s>]/i.test(head);
}

const fileNameFor = (name: string, format: "pdf" | "svg") => cleanFileName(name, "application/pdf").replace(/\.pdf$/, `.${format}`);

const PROBLEM_TEXT: Record<OutletProblem, string> = {
  duplicatePanelPort: "Patch panel port on another outlet too",
  duplicateSwitchPort: "Switch port on another outlet too",
  noPanel: "No patch panel label",
  noSwitch: "No switch label",
  noPort: "A port number is missing",
  written: "Label tidied to be read",
};

function checkDrawing(d: Drawing) {
  if (d.file.bytes.length === 0) throw badRequest("fileEmpty");
  if (d.file.bytes.length > MAX_UPLOAD_BYTES) throw badRequest("fileSize");
  const format = sniffType(d.file.bytes) === "application/pdf" ? "pdf" : isSvg(d.file.bytes) ? "svg" : null;
  if (!format) throw badRequest("fileType");
  const sizes = [d.page.width, d.page.height, d.mark.width, d.mark.height];
  if (sizes.some((n) => !Number.isFinite(n) || n <= 0 || n > 20_000)) throw badRequest("pageSize");
  const fit = d.fit ?? null;
  if (fit && (fit.length !== 6 || fit.some((n) => typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 100))) throw badRequest("fit");
  return { format, outlets: d.outlets === null ? null : readOutletsInput.parse(d.outlets), fit } as const;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const moved = (fit: number[], p: { x: number; y: number }) => ({ x: clamp01(fit[0] * p.x + fit[1] * p.y + fit[2]), y: clamp01(fit[3] * p.x + fit[4] * p.y + fit[5]) });

/** The floor plans, with how many outlets each has. */
export async function listPlans() {
  const plans = await db
    .select({ id: floorPlans.id, name: floorPlans.name, fileName: floorPlans.fileName, updatedAt: floorPlans.updatedAt, updatedByName: floorPlans.updatedByName })
    .from(floorPlans)
    .orderBy(asc(floorPlans.name), asc(floorPlans.id));
  const counts = await db.select({ planId: networkOutlets.planId, n: count() }).from(networkOutlets).groupBy(networkOutlets.planId);
  return plans.map((p) => ({ ...p, outlets: counts.find((c) => c.planId === p.id)?.n ?? 0 }));
}

/**
 * A plan with every outlet, what is plugged into each and what to look at in it, and the switches
 * its numbers stand for with their status from monitoring.
 */
export async function getPlan(id: number) {
  const [plan] = await db.select().from(floorPlans).where(eq(floorPlans.id, id));
  if (!plan) throw notFound();
  const rows = await db
    .select({ outlet: networkOutlets, assetName: assets.name })
    .from(networkOutlets)
    .leftJoin(assets, eq(assets.id, networkOutlets.assetId))
    .where(eq(networkOutlets.planId, id))
    .orderBy(asc(networkOutlets.y), asc(networkOutlets.x), asc(networkOutlets.id));
  const problems = outletProblems(rows.map((r) => r.outlet));
  const switchIds = [...new Set(Object.values(plan.switches))];
  const switchAssets = switchIds.length
    ? await db
        .select({ id: assets.id, name: assets.name, ipAddress: assets.ipAddress, monitorStatus: assets.monitorStatus })
        .from(assets)
        .where(inArray(assets.id, switchIds))
    : [];
  const numbers = [...new Set(rows.flatMap((r) => (r.outlet.switchNo === null ? [] : [r.outlet.switchNo])).concat(Object.keys(plan.switches).map(Number)))].toSorted((a, b) => a - b);
  const { storageKey, ...shown } = plan;
  return {
    ...shown,
    /** Changes with each new drawing, for the page to fetch it again. */
    drawingVersion: storageKey.slice(8, 16),
    outlets: rows.map((r, i) => ({ ...r.outlet, assetName: r.assetName, problems: problems[i] })),
    switches: numbers.map((n) => {
      const asset = switchAssets.find((a) => a.id === plan.switches[String(n)]) ?? null;
      return { number: n, ports: rows.filter((r) => r.outlet.switchNo === n).length, asset };
    }),
    panels: [...new Set(rows.flatMap((r) => (r.outlet.panel === null ? [] : [r.outlet.panel])))].toSorted((a, b) => a - b),
  };
}

/** Adds a floor's plan: the drawing and the outlets read from it. */
export async function createPlan(name: string, drawing: Drawing, actor: Actor) {
  const checked = checkDrawing(drawing);
  const outlets = checked.outlets ?? [];
  const planName = floorPlanInput.shape.name.unwrap().parse(name);
  const storageKey = await storeFile(drawing.file.bytes);
  try {
    const plan = await db.transaction(async (tx) => {
      const made = one(
        await tx
          .insert(floorPlans)
          .values({
            name: planName,
            format: checked.format,
            fileName: fileNameFor(drawing.file.name, checked.format),
            size: drawing.file.bytes.length,
            storageKey,
            pageWidth: drawing.page.width,
            pageHeight: drawing.page.height,
            markWidth: drawing.mark.width,
            markHeight: drawing.mark.height,
            updatedByName: actor.name,
          })
          .returning({ id: floorPlans.id }),
      );
      if (outlets.length) await tx.insert(networkOutlets).values(outlets.map((o) => ({ ...o, planId: made.id })));
      return made;
    });
    await audit(actor, "create", "floor_plan", plan.id, `Added the floor plan "${planName}" with ${outlets.length} outlets`);
    return plan;
  } catch (error) {
    await removeStoredFile(storageKey);
    throw error;
  }
}

/**
 * A new drawing for a plan, a PDF or an SVG; its outlets replaced with those read from it, or kept
 * (moved onto the new drawing when a fit is given, with the rack).
 */
export async function replaceDrawing(id: number, drawing: Drawing, actor: Actor) {
  const { format, outlets, fit } = checkDrawing(drawing);
  const [plan] = await db.select().from(floorPlans).where(eq(floorPlans.id, id));
  if (!plan) throw notFound();
  const storageKey = await storeFile(drawing.file.bytes);
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(floorPlans)
        .set({
          format,
          fileName: fileNameFor(drawing.file.name, format),
          // The new drawing's layers are its own; the rack goes where the fit puts it.
          layers: {},
          rack: plan.rack && fit && !outlets ? moved(fit, plan.rack) : plan.rack,
          size: drawing.file.bytes.length,
          storageKey,
          pageWidth: drawing.page.width,
          pageHeight: drawing.page.height,
          markWidth: drawing.mark.width,
          markHeight: drawing.mark.height,
          updatedByName: actor.name,
        })
        .where(eq(floorPlans.id, id));
      if (outlets) {
        await tx.delete(networkOutlets).where(eq(networkOutlets.planId, id));
        if (outlets.length) await tx.insert(networkOutlets).values(outlets.map((o) => ({ ...o, planId: id })));
      } else if (fit) {
        const kept = await tx.select({ id: networkOutlets.id, x: networkOutlets.x, y: networkOutlets.y }).from(networkOutlets).where(eq(networkOutlets.planId, id));
        for (const o of kept) await tx.update(networkOutlets).set(moved(fit, o)).where(eq(networkOutlets.id, o.id));
      }
    });
  } catch (error) {
    await removeStoredFile(storageKey);
    throw error;
  }
  await removeStoredFile(plan.storageKey);
  await audit(
    actor,
    "update",
    "floor_plan",
    id,
    outlets
      ? `New drawing for "${plan.name}", ${outlets.length} outlets read from it`
      : `New drawing for "${plan.name}", outlets kept${fit ? " and moved onto it" : ""}`,
  );
  return { id };
}

/** Renames a plan, says which asset each switch number is, where the rack stands or how the layers show: whichever is given. */
export async function updatePlan(id: number, input: z.input<typeof floorPlanInput>, actor: Actor) {
  const values = floorPlanInput.parse(input);
  const ids = [...new Set(Object.values(values.switches ?? {}))];
  if (ids.length) {
    const found = await db.select({ id: assets.id }).from(assets).where(inArray(assets.id, ids));
    if (found.length !== ids.length) throw badRequest("A linked record does not exist");
  }
  const row = one(await db.update(floorPlans).set({ ...values, updatedByName: actor.name }).where(eq(floorPlans.id, id)).returning({ id: floorPlans.id, name: floorPlans.name }));
  await audit(actor, "update", "floor_plan", id, `Updated the floor plan "${row.name}"`);
  return { id: row.id };
}

export async function deletePlan(id: number, actor: Actor) {
  const plan = one(await db.delete(floorPlans).where(eq(floorPlans.id, id)).returning());
  await removeStoredFile(plan.storageKey);
  await audit(actor, "delete", "floor_plan", id, `Deleted the floor plan "${plan.name}"`);
  return { id };
}

/** The drawing itself, a PDF. */
export async function planDrawing(id: number) {
  const [plan] = await db.select().from(floorPlans).where(eq(floorPlans.id, id));
  if (!plan) throw notFound();
  return { name: plan.fileName, format: plan.format, bytes: await readStoredFile(plan.storageKey) };
}

const described = (o: { panel: number | null; panelPort: number | null; switchNo: number | null; switchPort: number | null }) =>
  [panelLabel(o), switchLabel(o)].filter(Boolean).join(" / ") || "an unlabelled outlet";

export async function createOutlet(planId: number, input: z.input<typeof outletInput>, actor: Actor) {
  const values = outletInput.parse(input);
  const [plan] = await db.select({ id: floorPlans.id }).from(floorPlans).where(eq(floorPlans.id, planId));
  if (!plan) throw notFound();
  const row = one(await db.insert(networkOutlets).values({ ...values, planId }).returning());
  await audit(actor, "create", "network_outlet", row.id, `Added outlet ${described(row)}`);
  return row;
}

export async function updateOutlet(id: number, input: z.input<typeof outletInput>, actor: Actor) {
  const values = outletInput.parse(input);
  // A label corrected by hand is no longer one tidied from the drawing.
  const row = one(await db.update(networkOutlets).set({ ...values, written: "" }).where(eq(networkOutlets.id, id)).returning());
  await audit(actor, "update", "network_outlet", id, `Updated outlet ${described(row)}`);
  return row;
}

export async function deleteOutlet(id: number, actor: Actor) {
  const row = one(await db.delete(networkOutlets).where(eq(networkOutlets.id, id)).returning());
  await audit(actor, "delete", "network_outlet", id, `Removed outlet ${described(row)}`);
  return { id };
}

/** Where an asset is on the floor plans: the outlets it is plugged into, and the plans where it is a switch. */
export async function assetOnPlans(assetId: number) {
  const outlets = await db
    .select({ id: networkOutlets.id, planId: networkOutlets.planId, planName: floorPlans.name, panel: networkOutlets.panel, panelPort: networkOutlets.panelPort, switchNo: networkOutlets.switchNo, switchPort: networkOutlets.switchPort, room: networkOutlets.room })
    .from(networkOutlets)
    .innerJoin(floorPlans, eq(floorPlans.id, networkOutlets.planId))
    .where(eq(networkOutlets.assetId, assetId))
    .orderBy(asc(floorPlans.name), asc(networkOutlets.id));
  const plans = await db.select({ id: floorPlans.id, name: floorPlans.name, switches: floorPlans.switches }).from(floorPlans);
  const asSwitch = plans.flatMap((p) =>
    Object.entries(p.switches)
      .filter(([, a]) => a === assetId)
      .map(([n]) => ({ planId: p.id, planName: p.name, switchNo: Number(n) })),
  );
  return { outlets, asSwitch };
}

/** A plan's outlets as a workbook: what each patch panel port and switch port serves. */
export async function exportPlan(id: number) {
  const plan = await getPlan(id);
  const bold = { fontWeight: "bold" as const };
  const header = ["Outlet", "Patch panel", "Panel port", "Switch", "Switch port", "Switch name", "Room", "Connected device", "Note", "To check"];
  const switchName = (n: number | null) => plan.switches.find((s) => s.number === n)?.asset?.name ?? null;
  const rows: Row[] = [
    [{ value: `Network outlets — ${plan.name}`, ...bold, fontSize: 14 }],
    header.map((value) => ({ value, ...bold, backgroundColor: "#DCE6F1" })),
    ...plan.outlets
      .toSorted((a, b) => (a.panel ?? 999) - (b.panel ?? 999) || (a.panelPort ?? 999) - (b.panelPort ?? 999) || a.id - b.id)
      .map((o): Row => [
        described(o),
        o.panel,
        o.panelPort,
        o.switchNo,
        o.switchPort,
        switchName(o.switchNo),
        o.room || null,
        o.assetName,
        o.note || null,
        o.problems.map((p) => PROBLEM_TEXT[p]).join("; ") || null,
      ]),
  ];
  const bytes = await writeXlsxFile([{ data: rows, sheet: "Outlets", columns: [16, 12, 11, 10, 11, 22, 24, 24, 30, 40].map((width) => ({ width })), stickyRowsCount: 2 }]).toBuffer();
  return { name: `${plan.name} outlets.xlsx`, bytes };
}
