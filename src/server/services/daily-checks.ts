import { desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { DAILY_CHECKS } from "@/lib/domain";
import type { dailyCheckInput } from "@/lib/schemas";
import type { Actor } from "../audit";
import { db } from "../db";
import { dailyChecks } from "../db/schema";
import { one } from "../http";

/** The checklist for one day: every item, done or not, with who ticked it and when. */
export async function dailyChecklist(date: string) {
  const rows = await db.select().from(dailyChecks).where(eq(dailyChecks.date, date));
  return DAILY_CHECKS.map((item) => {
    const row = rows.find((r) => r.item === item);
    return {
      item,
      done: row?.done ?? false,
      note: row?.note ?? null,
      checkedByName: row?.checkedByName ?? null,
      checkedAt: row?.checkedAt ?? null,
    };
  });
}

/** How many items were done on each of the most recent days with any record. */
export async function dailyHistory(days = 14) {
  return db
    .select({ date: dailyChecks.date, done: sql<number>`count(*) filter (where ${dailyChecks.done})`.mapWith(Number) })
    .from(dailyChecks)
    .groupBy(dailyChecks.date)
    .orderBy(desc(dailyChecks.date))
    .limit(days);
}

/** Ticks or unticks an item for a day, recording who did it. */
export async function recordDailyCheck(input: z.infer<typeof dailyCheckInput>, actor: Actor) {
  const values = { ...input, checkedBy: actor.id, checkedByName: actor.name, checkedAt: new Date() };
  return one(
    await db
      .insert(dailyChecks)
      .values(values)
      .onConflictDoUpdate({ target: [dailyChecks.date, dailyChecks.item], set: values })
      .returning(),
  );
}
