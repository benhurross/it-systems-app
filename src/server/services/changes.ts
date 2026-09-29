import { desc, eq, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { ref } from "@/lib/domain";
import type { changeDecision, changeInput } from "@/lib/schemas";
import { nextChangeStatuses } from "@/lib/workflows";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, changes, users } from "../db/schema";
import { badRequest, one } from "../http";

const requester = alias(users, "requester");
const approver = alias(users, "approver");

const withNames = () =>
  db
    .select({
      ...getTableColumns(changes),
      assetName: assets.name,
      requestedByName: requester.name,
      approvedByName: approver.name,
    })
    .from(changes)
    .leftJoin(assets, eq(assets.id, changes.assetId))
    .leftJoin(requester, eq(requester.id, changes.requestedBy))
    .leftJoin(approver, eq(approver.id, changes.approvedBy));

export async function listChanges() {
  return withNames().orderBy(desc(changes.plannedAt));
}

export async function getChange(id: number) {
  return one(await withNames().where(eq(changes.id, id)));
}

const toRow = (input: z.infer<typeof changeInput>) => ({ ...input, plannedAt: new Date(input.plannedAt) });

export async function createChange(input: z.infer<typeof changeInput>, actor: Actor) {
  const row = one(await db.insert(changes).values({ ...toRow(input), requestedBy: actor.id }).returning());
  await audit(actor, "create", "change", row.id, `Requested ${ref("change", row.id)}: ${row.title}`);
  return row;
}

/** Details can be corrected until the change is implemented or rejected. */
export async function updateChange(id: number, input: z.infer<typeof changeInput>, actor: Actor) {
  const current = await getChange(id);
  if (current.status === "implemented" || current.status === "rejected") throw badRequest("This change is closed");
  const row = one(await db.update(changes).set(toRow(input)).where(eq(changes.id, id)).returning());
  await audit(actor, "update", "change", id, `Updated ${ref("change", id)}`);
  return row;
}

export async function decideChange(id: number, input: z.infer<typeof changeDecision>, actor: Actor) {
  const current = await getChange(id);
  if (!nextChangeStatuses(current.status).includes(input.status)) {
    throw badRequest(`A change cannot move from ${current.status} to ${input.status}`);
  }
  const row = one(
    await db
      .update(changes)
      .set({
        status: input.status,
        ...(input.status === "approved" && { approvedBy: actor.id }),
        ...(input.status === "implemented" && { implementedAt: new Date(), result: input.result }),
      })
      .where(eq(changes.id, id))
      .returning(),
  );
  const detail = input.status === "implemented" ? ` (${input.result})` : "";
  await audit(actor, input.status === "approved" ? "approve" : "update", "change", id, `${ref("change", id)} ${input.status}${detail}`);
  return row;
}
