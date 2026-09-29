import { asc, desc, eq, getTableColumns, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { ref } from "@/lib/domain";
import type { assetInput, assetMove, relationshipInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import {
  assetMovements,
  assets,
  employees,
  licenseInstalls,
  licenses,
  relationships,
  tickets,
} from "../db/schema";
import { one } from "../http";

const withHolder = () =>
  db
    .select({ ...getTableColumns(assets), assignedName: employees.name })
    .from(assets)
    .leftJoin(employees, eq(employees.id, assets.assignedTo));

export async function listAssets() {
  return withHolder().orderBy(asc(assets.id));
}

const fromEmployee = alias(employees, "from_employee");
const toEmployee = alias(employees, "to_employee");

/** One asset with its history, relations, installed software and tickets. */
export async function getAsset(id: number) {
  const asset = one(await withHolder().where(eq(assets.id, id)));
  const [movements, related, software, recentTickets] = await Promise.all([
    db
      .select({
        ...getTableColumns(assetMovements),
        fromEmployeeName: fromEmployee.name,
        toEmployeeName: toEmployee.name,
      })
      .from(assetMovements)
      .leftJoin(fromEmployee, eq(fromEmployee.id, assetMovements.fromEmployeeId))
      .leftJoin(toEmployee, eq(toEmployee.id, assetMovements.toEmployeeId))
      .where(eq(assetMovements.assetId, id))
      .orderBy(desc(assetMovements.movedAt)),
    listRelationships(id),
    db
      .select({ licenseId: licenses.id, product: licenses.product, version: licenses.version })
      .from(licenseInstalls)
      .innerJoin(licenses, eq(licenses.id, licenseInstalls.licenseId))
      .where(eq(licenseInstalls.assetId, id))
      .orderBy(asc(licenses.product)),
    db
      .select({ id: tickets.id, subject: tickets.subject, status: tickets.status, createdAt: tickets.createdAt })
      .from(tickets)
      .where(eq(tickets.assetId, id))
      .orderBy(desc(tickets.createdAt))
      .limit(10),
  ]);
  return { ...asset, movements, relationships: related, software, tickets: recentTickets };
}

export async function createAsset(input: z.infer<typeof assetInput>, actor: Actor) {
  const row = one(await db.insert(assets).values(input).returning());
  await audit(actor, "create", "asset", row.id, `Registered ${ref("asset", row.id)}: ${row.name}`);
  return row;
}

export async function updateAsset(id: number, input: z.infer<typeof assetInput>, actor: Actor) {
  const row = one(await db.update(assets).set(input).where(eq(assets.id, id)).returning());
  await audit(actor, "update", "asset", id, `Updated ${ref("asset", id)}: ${row.name}`);
  return row;
}

/**
 * Moves or reassigns an asset and writes the movement register in one transaction.
 * Handing it to someone puts it in use; taking it back from someone returns it to stock.
 */
export async function moveAsset(id: number, input: z.infer<typeof assetMove>, actor: Actor) {
  const row = await db.transaction(async (tx) => {
    const current = one(await tx.select().from(assets).where(eq(assets.id, id)));
    await tx.insert(assetMovements).values({
      assetId: id,
      fromLocation: current.location,
      toLocation: input.toLocation,
      fromEmployeeId: current.assignedTo,
      toEmployeeId: input.toEmployeeId,
      reason: input.reason,
      movedBy: actor.name,
    });
    const status = input.toEmployeeId ? "in_use" : current.status === "in_use" ? "in_stock" : current.status;
    return one(
      await tx
        .update(assets)
        .set({ location: input.toLocation, assignedTo: input.toEmployeeId, status })
        .where(eq(assets.id, id))
        .returning(),
    );
  });
  await audit(actor, "move", "asset", id, `Moved ${ref("asset", id)} to ${input.toLocation}: ${input.reason}`);
  return row;
}

// ---------------------------------------------------------------- CMDB relationships

const source = alias(assets, "source");
const target = alias(assets, "target");

/** Every relationship, or those touching one asset. */
export async function listRelationships(assetId?: number) {
  return db
    .select({
      ...getTableColumns(relationships),
      sourceName: source.name,
      sourceCategory: source.category,
      targetName: target.name,
      targetCategory: target.category,
    })
    .from(relationships)
    .innerJoin(source, eq(source.id, relationships.sourceId))
    .innerJoin(target, eq(target.id, relationships.targetId))
    .where(assetId ? or(eq(relationships.sourceId, assetId), eq(relationships.targetId, assetId)) : undefined)
    .orderBy(asc(relationships.id));
}

export async function createRelationship(input: z.infer<typeof relationshipInput>, actor: Actor) {
  const row = one(await db.insert(relationships).values(input).returning());
  await audit(
    actor,
    "create",
    "relationship",
    row.id,
    `${ref("asset", row.sourceId)} ${row.type.replace("_", " ")} ${ref("asset", row.targetId)}`,
  );
  return row;
}

export async function deleteRelationship(id: number, actor: Actor) {
  const row = one(await db.delete(relationships).where(eq(relationships.id, id)).returning());
  await audit(
    actor,
    "delete",
    "relationship",
    id,
    `Removed ${ref("asset", row.sourceId)} ${row.type.replace("_", " ")} ${ref("asset", row.targetId)}`,
  );
  return row;
}
