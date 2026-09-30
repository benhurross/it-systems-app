import { asc, desc, eq } from "drizzle-orm";
import { requesterSummary } from "@/lib/self-service";
import type { SessionUser } from "../auth";
import { db } from "../db";
import { assets, tickets } from "../db/schema";

/** How many of a person's latest requests their dashboard lists. */
export const LATEST_REQUESTS = 5;

/** The signed-in person's own dashboard: their requests and the devices assigned to them. */
export async function mySummary(user: SessionUser, now = new Date()) {
  const employeeId = user.employeeId;
  if (!employeeId) return { linked: false as const };

  const [raised, held] = await Promise.all([
    db
      .select({
        id: tickets.id,
        subject: tickets.subject,
        status: tickets.status,
        createdAt: tickets.createdAt,
        resolvedAt: tickets.resolvedAt,
        closedAt: tickets.closedAt,
      })
      .from(tickets)
      .where(eq(tickets.requesterId, employeeId))
      .orderBy(desc(tickets.createdAt), desc(tickets.id)),
    db
      .select({
        id: assets.id,
        name: assets.name,
        category: assets.category,
        type: assets.type,
        manufacturer: assets.manufacturer,
        model: assets.model,
        serial: assets.serial,
        status: assets.status,
        location: assets.location,
        warrantyEnd: assets.warrantyEnd,
      })
      .from(assets)
      .where(eq(assets.assignedTo, employeeId))
      .orderBy(asc(assets.name)),
  ]);

  return {
    linked: true as const,
    summary: requesterSummary(raised, now),
    awaiting: raised.filter((t) => t.status === "resolved"),
    latest: raised.slice(0, LATEST_REQUESTS),
    assets: held.filter((a) => a.status !== "retired"),
  };
}

/** The device a request is about, when it is one the requester holds; anyone else's is ignored. */
export async function heldAsset(assetId: number | null | undefined, employeeId: number) {
  if (!assetId) return null;
  const [row] = await db.select({ assignedTo: assets.assignedTo }).from(assets).where(eq(assets.id, assetId));
  return row?.assignedTo === employeeId ? assetId : null;
}
