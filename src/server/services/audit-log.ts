import { and, desc, eq, gte, lt } from "drizzle-orm";
import { addDays } from "@/lib/dates";
import { db } from "../db";
import { auditLog } from "../db/schema";

/** Midnight in Riyadh at the start of an ISO date, as an instant. */
const riyadhMidnight = (iso: string) => new Date(`${iso}T00:00:00+03:00`);

/** The most recent entries, optionally narrowed to an entity, a person and a date range (Riyadh days). */
export async function listAudit(filters: { entity?: string; userId?: string; from?: string; to?: string }) {
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        filters.entity ? eq(auditLog.entity, filters.entity) : undefined,
        filters.userId ? eq(auditLog.userId, filters.userId) : undefined,
        filters.from ? gte(auditLog.at, riyadhMidnight(filters.from)) : undefined,
        filters.to ? lt(auditLog.at, riyadhMidnight(addDays(filters.to, 1))) : undefined,
      ),
    )
    .orderBy(desc(auditLog.at))
    .limit(1000);
}
