import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { isoDate } from "@/lib/dates";
import { ref } from "@/lib/domain";
import { budgetLines, fiscalYearOf, fiscalYearRange } from "@/lib/finance";
import type { budgetInput, contractInput, purchaseInput, purchaseStatus, vendorInput } from "@/lib/schemas";
import { nextPurchaseStatuses } from "@/lib/workflows";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, budgets, contracts, employees, purchases, users, vendors } from "../db/schema";
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
