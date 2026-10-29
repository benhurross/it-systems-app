import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { isoDate } from "@/lib/dates";
import { ref } from "@/lib/domain";
import { budgetLines, fiscalYearOf, fiscalYearRange } from "@/lib/finance";
import type { budgetInput, contractInput, purchaseInput, purchaseStatus, vendorInput } from "@/lib/schemas";
import { nextPurchaseStatuses } from "@/lib/workflows";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, attachments, budgets, contracts, employees, purchases, users, vendors } from "../db/schema";
import { removeStoredFile } from "../files";
import { badRequest, one } from "../http";
import { getSetting } from "../settings";

// ---------------------------------------------------------------- vendors

export async function listVendors() {
  return db.select().from(vendors).orderBy(asc(vendors.name));
}

export async function createVendor(input: z.infer<typeof vendorInput>, actor: Actor) {
  const row = one(await db.insert(vendors).values(input).returning());
  await audit(actor, "create", "vendor", row.id, `Added vendor ${row.name}`);
  return row;
}

export async function updateVendor(id: number, input: z.infer<typeof vendorInput>, actor: Actor) {
  const row = one(await db.update(vendors).set(input).where(eq(vendors.id, id)).returning());
  await audit(actor, "update", "vendor", id, `Updated vendor ${row.name}`);
  return row;
}

/** Deletes a vendor. Its contracts, purchases and licences stay, no longer naming it. */
export async function deleteVendor(id: number, actor: Actor) {
  const row = one(await db.delete(vendors).where(eq(vendors.id, id)).returning());
  await audit(actor, "delete", "vendor", id, `Deleted vendor ${row.name}`);
  return { id };
}

/** Deletes a contract or purchase with its documents, which are attached by kind and number. */
async function deleteWithDocuments(entity: "contract" | "purchase", id: number) {
  const table = entity === "contract" ? contracts : purchases;
  const { row, files } = await db.transaction(async (tx) => {
    const detached = await tx
      .delete(attachments)
      .where(and(eq(attachments.entity, entity), eq(attachments.entityId, id)))
      .returning({ key: attachments.storageKey });
    return { row: one(await tx.delete(table).where(eq(table.id, id)).returning({ title: table.title })), files: detached.map((d) => d.key) };
  });
  for (const key of files) await removeStoredFile(key);
  return row;
}

// ---------------------------------------------------------------- contracts

export async function listContracts() {
  return db
    .select({ ...getTableColumns(contracts), vendorName: vendors.name })
    .from(contracts)
    .leftJoin(vendors, eq(vendors.id, contracts.vendorId))
    .orderBy(asc(contracts.endDate));
}

export async function createContract(input: z.infer<typeof contractInput>, actor: Actor) {
  const row = one(await db.insert(contracts).values(input).returning());
  await audit(actor, "create", "contract", row.id, `Added ${ref("contract", row.id)}: ${row.title}`);
  return row;
}

export async function updateContract(id: number, input: z.infer<typeof contractInput>, actor: Actor) {
  const row = one(await db.update(contracts).set(input).where(eq(contracts.id, id)).returning());
  await audit(actor, "update", "contract", id, `Updated ${ref("contract", id)}: ${row.title}`);
  return row;
}

export async function deleteContract(id: number, actor: Actor) {
  const row = await deleteWithDocuments("contract", id);
  await audit(actor, "delete", "contract", id, `Deleted ${ref("contract", id)}: ${row.title}`);
  return { id };
}

// ---------------------------------------------------------------- purchases

const requester = alias(users, "requester");
const approver = alias(users, "approver");

export async function listPurchases() {
  return db
    .select({
      ...getTableColumns(purchases),
      vendorName: vendors.name,
      requestedForName: employees.name,
      requestedByName: requester.name,
      approvedByName: approver.name,
      inInventory: sql<number>`(select count(*) from ${assets} where ${assets.purchaseId} = ${purchases.id})`.mapWith(Number),
    })
    .from(purchases)
    .leftJoin(vendors, eq(vendors.id, purchases.vendorId))
    .leftJoin(employees, eq(employees.id, purchases.requestedFor))
    .leftJoin(requester, eq(requester.id, purchases.requestedBy))
    .leftJoin(approver, eq(approver.id, purchases.approvedBy))
    .orderBy(desc(purchases.createdAt));
}

export async function createPurchase(input: z.infer<typeof purchaseInput>, actor: Actor) {
  const row = one(await db.insert(purchases).values({ ...input, requestedBy: actor.id }).returning());
  await audit(actor, "create", "purchase", row.id, `Requested ${ref("purchase", row.id)}: ${row.title}`);
  return row;
}

/** Details can change only while the request awaits a decision. */
export async function updatePurchase(id: number, input: z.infer<typeof purchaseInput>, actor: Actor) {
  const current = one(await db.select().from(purchases).where(eq(purchases.id, id)));
  if (current.status !== "requested") throw badRequest("Only a pending request can be edited");
  const row = one(await db.update(purchases).set(input).where(eq(purchases.id, id)).returning());
  await audit(actor, "update", "purchase", id, `Updated ${ref("purchase", id)}`);
  return row;
}

/** Deletes a purchase request with its documents. Assets bought with it stay, no longer linked to it. */
export async function deletePurchase(id: number, actor: Actor) {
  const row = await deleteWithDocuments("purchase", id);
  await audit(actor, "delete", "purchase", id, `Deleted ${ref("purchase", id)}: ${row.title}`);
  return { id };
}

export async function setPurchaseStatus(id: number, input: z.infer<typeof purchaseStatus>, actor: Actor) {
  const current = one(await db.select().from(purchases).where(eq(purchases.id, id)));
  if (!nextPurchaseStatuses(current.status).includes(input.status)) {
    throw badRequest(`A purchase cannot move from ${current.status} to ${input.status}`);
  }
  const now = new Date();
  const decided = input.status === "approved" || input.status === "rejected";
  const row = one(
    await db
      .update(purchases)
      .set({
        status: input.status,
        ...(decided && current.status === "requested" && { approvedBy: actor.id, decidedAt: now }),
        ...(input.status === "ordered" && { orderedAt: now }),
        ...(input.status === "received" && { receivedAt: now }),
      })
      .where(eq(purchases.id, id))
      .returning(),
  );
  await audit(actor, input.status === "approved" ? "approve" : "update", "purchase", id, `${ref("purchase", id)} ${input.status}`);
  return row;
}

// ---------------------------------------------------------------- budget

/** The budget for a fiscal year, line by line, with what contracts and purchases commit against it. */
export async function budgetSummary(year?: number) {
  const { fiscalYearStartMonth: startMonth } = await getSetting("organisation");
  const fiscalYear = year ?? fiscalYearOf(isoDate(), startMonth);
  const [budgetRows, contractRows, purchaseRows] = await Promise.all([
    db.select().from(budgets).where(eq(budgets.fiscalYear, fiscalYear)),
    db.select().from(contracts),
    db.select().from(purchases),
  ]);
  const lines = budgetLines(
    {
      budgets: budgetRows,
      contracts: contractRows,
      purchases: purchaseRows.map((p) => ({ ...p, date: isoDate(p.decidedAt ?? p.createdAt) })),
    },
    fiscalYear,
    startMonth,
  );
  const [from, to] = fiscalYearRange(fiscalYear, startMonth);
  return { fiscalYear, startMonth, from, to, lines };
}

export async function setBudget(input: z.infer<typeof budgetInput>, actor: Actor) {
  const row = one(
    await db
      .insert(budgets)
      .values(input)
      .onConflictDoUpdate({ target: [budgets.fiscalYear, budgets.category], set: { amount: input.amount } })
      .returning(),
  );
  await audit(actor, "update", "budget", row.id, `Set FY${row.fiscalYear} ${row.category} budget to ${row.amount}`);
  return row;
}
