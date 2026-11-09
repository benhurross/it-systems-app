import { asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { codeOf } from "@/lib/asset-specs";
import type { lookupInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { lookups } from "../db/schema";
import { one } from "../http";

export async function listLookups({ includeInactive = false } = {}) {
  return db
    .select()
    .from(lookups)
    .where(includeInactive ? undefined : eq(lookups.active, true))
    .orderBy(asc(lookups.list), asc(lookups.sortOrder), asc(lookups.labelEn));
}

export async function createLookup(input: z.infer<typeof lookupInput>, actor: Actor) {
  const row = one(await db.insert(lookups).values(input).returning());
  await audit(actor, "create", "lookup", row.id, `Added "${row.labelEn}" to ${row.list}`);
  return row;
}

/** The code is fixed once created: records store it. */
export async function updateLookup(id: number, input: z.infer<typeof lookupInput>, actor: Actor) {
  const { labelEn, labelAr, sortOrder, active } = input;
  const row = one(
    await db.update(lookups).set({ labelEn, labelAr, sortOrder, active }).where(eq(lookups.id, id)).returning(),
  );
  await audit(actor, "update", "lookup", row.id, `Updated "${row.labelEn}" in ${row.list}${active ? "" : " (inactive)"}`);
  return row;
}

/** The lists IT may add a value to straight from a form (the asset form's dropdowns). */
export const QUICK_LISTS = ["processor", "storage_type", "operating_system", "manufacturer"] as const;
export type QuickList = (typeof QUICK_LISTS)[number];

/**
 * A value typed in a form's dropdown, added to its list so it is offered from then on; one with the
 * same name already there (active or not) is used instead, and switched back on.
 */
export async function addLookupValue(list: QuickList, label: string, actor: Actor) {
  const rows = await db.select().from(lookups).where(eq(lookups.list, list));
  // The same name, whatever its case, spaces or signs: "HDD", "hdd", "H.D.D.".
  const key = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const same = rows.find((r) => key(r.labelEn) === key(label) || key(r.labelAr) === key(label));
  if (same) {
    if (!same.active) await db.update(lookups).set({ active: true }).where(eq(lookups.id, same.id));
    return { ...same, active: true };
  }
  const base = codeOf(label);
  const taken = new Set(rows.map((r) => r.code));
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}_${n}`;
  const sortOrder = Math.max(-1, ...rows.map((r) => r.sortOrder)) + 1;
  const row = one(await db.insert(lookups).values({ list, code, labelEn: label.trim(), labelAr: label.trim(), sortOrder }).returning());
  await audit(actor, "create", "lookup", row.id, `Added "${row.labelEn}" to ${list} from a form`);
  return row;
}
