import { inArray } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import { type Cell, planImport, type ImportContext } from "@/lib/asset-import";
import { HARDWARE_LISTS } from "@/lib/asset-specs";
import { parseCsv } from "@/lib/csv";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { assetInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { employees, lookups } from "../db/schema";
import { badRequest } from "../http";
import { createAsset, listAssets, moveAsset, updateAsset } from "./assets";
import { listRooms } from "./floor-plans";

const MAX_ROWS = 5000;

/** The first sheet of an Excel workbook, or the rows of a CSV file. */
async function readFile(name: string, bytes: Uint8Array): Promise<Cell[][]> {
  if (bytes.length === 0) throw badRequest("fileEmpty");
  if (bytes.length > MAX_UPLOAD_BYTES) throw badRequest("fileSize");
  if (/\.csv$/i.test(name)) return parseCsv(new TextDecoder().decode(bytes));
  // An .xlsx workbook is a zip file.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw badRequest("fileType");
  try {
    return (await readSheet(Buffer.from(bytes))) as Cell[][];
  } catch {
    throw badRequest("fileType");
  }
}

async function context(): Promise<ImportContext> {
  const [lists, people, assets, rooms] = await Promise.all([
    db.select().from(lookups).where(inArray(lookups.list, ["asset_category", "asset_type", "location", "manufacturer", ...HARDWARE_LISTS])),
    db.select({ id: employees.id, name: employees.name, email: employees.email, number: employees.employeeNumber, active: employees.active }).from(employees),
    listAssets(),
    listRooms(),
  ]);
  return {
    lookups: lists,
    rooms,
    employees: people,
    // As the edit form would send each back; a row the form would refuse is matched but kept as it is.
    assets: assets.map((a) => ({ ...(assetInput.safeParse(a).data ?? (a as never)), id: a.id })),
  };
}

/**
 * What loading the file would do or, with `apply`, does: adds the new assets and updates those it
 * names. A change of place or holder goes in the movement register, as Move would write it.
 */
export async function importAssets(file: { name: string; bytes: Uint8Array }, apply: boolean, actor: Actor) {
  const sheet = await readFile(file.name, file.bytes);
  if (sheet.length > MAX_ROWS + 1) throw badRequest("tooManyRows");
  const ctx = await context();
  const plan = planImport(sheet, ctx);
  const counts = { add: 0, update: 0, unchanged: 0, skip: 0 };
  for (const row of plan.rows) counts[row.action]++;

  if (apply && !plan.problem) {
    const reason = `Imported from ${file.name}`;
    for (const value of plan.added) {
      const order = Math.max(-1, ...ctx.lookups.filter((l) => l.list === value.list).map((l) => l.sortOrder ?? 0)) + 1;
      const [row] = await db
        .insert(lookups)
        .values({ list: value.list, code: value.code, labelEn: value.label, labelAr: value.label, sortOrder: order })
        .onConflictDoNothing()
        .returning();
      if (row) await audit(actor, "create", "lookup", row.id, `Added "${row.labelEn}" to ${row.list}, ${reason.toLowerCase()}`);
    }
    for (const row of plan.rows) {
      if (row.action === "add") {
        row.assetId = (await createAsset(row.input!, actor)).id;
      } else if (row.action === "update") {
        const current = ctx.assets.find((a) => a.id === row.assetId)!;
        const input = row.input!;
        if (input.location !== current.location || input.room !== (current.room ?? "") || input.assignedTo !== current.assignedTo) {
          await moveAsset(
            row.assetId!,
            { toLocation: input.location, toRoom: input.room, toPlanId: input.planId, toEmployeeId: input.assignedTo, status: input.status, reason },
            actor,
          );
        }
        await updateAsset(row.assetId!, input, actor);
      }
    }
    if (counts.add + counts.update) await audit(actor, "import", "asset", file.name, `${reason}: ${counts.add} added, ${counts.update} updated`);
  }
  return {
    applied: apply && !plan.problem,
    problem: plan.problem,
    unused: plan.unused,
    added: plan.added,
    counts,
    // What each row would be saved as stays here.
    rows: plan.rows.map((row) => ({ ...row, input: undefined })),
  };
}
