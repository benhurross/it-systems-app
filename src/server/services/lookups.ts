import { asc, eq } from "drizzle-orm";
import type { z } from "zod";
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
