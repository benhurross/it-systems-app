import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type { workstationCheckInput, workstationRead, workstationSignIn } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, employees, lookups, users, workstationChecks, type WorkstationItem } from "../db/schema";
import { badRequest, notFound, one } from "../http";
import { getSetting } from "../settings";

/**
 * IT's desk checks against the IT standard, and the message each employee is shown once at their
 * next Windows sign-in: "good job", or what to fix. Reading it is recorded, in place of signing paper.
 */

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

const listed = {
  id: workstationChecks.id,
  assetId: workstationChecks.assetId,
  computerName: workstationChecks.computerName,
  employeeId: workstationChecks.employeeId,
  employeeName: workstationChecks.employeeName,
  result: workstationChecks.result,
  items: workstationChecks.items,
  message: workstationChecks.message,
  checkedByName: workstationChecks.checkedByName,
  checkedAt: workstationChecks.checkedAt,
  readAt: workstationChecks.readAt,
  readBy: workstationChecks.readBy,
  readOn: workstationChecks.readOn,
};

/** Checks, newest first: all of them, or one computer's or one person's. */
export async function listWorkstationChecks(filter: { assetId?: number; employeeId?: number } = {}) {
  const where: SQL[] = [];
  if (filter.assetId) where.push(eq(workstationChecks.assetId, filter.assetId));
  if (filter.employeeId) where.push(eq(workstationChecks.employeeId, filter.employeeId));
  const rows = await db
    .select(listed)
    .from(workstationChecks)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(workstationChecks.checkedAt), desc(workstationChecks.id));
  return rows.map(({ items, ...r }) => ({ ...r, toFix: items.filter((i) => i.state === "not_ok").length, itemCount: items.length }));
}

export async function getWorkstationCheck(id: number) {
  const [row] = await db.select(listed).from(workstationChecks).where(eq(workstationChecks.id, id));
  if (!row) throw notFound();
  return row;
}

/** The checklist as it stands: the items IT goes through, in order. */
export async function workstationChecklist() {
  return db
    .select({ code: lookups.code, labelEn: lookups.labelEn, labelAr: lookups.labelAr })
    .from(lookups)
    .where(and(eq(lookups.list, "workstation_check"), eq(lookups.active, true)))
    .orderBy(asc(lookups.sortOrder), asc(lookups.id));
}

/** Records a check. The employee is the computer's, unless IT names another; the result follows from the items. */
export async function createWorkstationCheck(input: z.infer<typeof workstationCheckInput>, actor: Actor) {
  const [asset] = await db.select({ id: assets.id, name: assets.name, assignedTo: assets.assignedTo }).from(assets).where(eq(assets.id, input.assetId));
  if (!asset) throw badRequest("A linked record does not exist");
  const codes = input.items.map((i) => i.code);
  if (new Set(codes).size !== codes.length) throw badRequest("Each item once");
  const labels = await db
    .select({ code: lookups.code, labelEn: lookups.labelEn, labelAr: lookups.labelAr })
    .from(lookups)
    .where(and(eq(lookups.list, "workstation_check"), inArray(lookups.code, codes)));
  const byCode = new Map(labels.map((l) => [l.code, l]));
  const items: WorkstationItem[] = input.items.map((i) => {
    const label = byCode.get(i.code);
    if (!label) throw badRequest("Not on the checklist");
    return { code: i.code, labelEn: label.labelEn, labelAr: label.labelAr, state: i.state, note: i.state === "not_ok" ? i.note : "" };
  });
  const employeeId = input.employeeId ?? asset.assignedTo;
  const [employee] = employeeId ? await db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.id, employeeId)) : [];
  if (employeeId && !employee) throw badRequest("A linked record does not exist");
  const result = items.some((i) => i.state === "not_ok") ? "attention" : "passed";
  const row = one(
    await db
      .insert(workstationChecks)
      .values({
        assetId: asset.id,
        computerName: asset.name,
        employeeId: employee?.id ?? null,
        employeeName: employee?.name ?? null,
        result,
        items,
        message: input.message,
        checkedBy: actor.id,
        checkedByName: actor.name,
      })
      .returning({ id: workstationChecks.id }),
  );
  await audit(actor, "create", "workstation_check", row.id, `Checked the workstation ${asset.name}${employee ? ` (${employee.name})` : ""}: ${result === "passed" ? "passed" : "needs attention"}`);
  return { id: row.id, result };
}

export async function deleteWorkstationCheck(id: number, actor: Actor) {
  const row = one(await db.delete(workstationChecks).where(eq(workstationChecks.id, id)).returning());
  await audit(actor, "delete", "workstation_check", id, `Deleted the check of ${row.computerName} made ${row.checkedAt.toISOString().slice(0, 10)}`);
  return { id };
}

// ------------------------------------------------------------- the employee's own

const employeeOfUser = async (userId: string) =>
  (await db.select({ employeeId: users.employeeId }).from(users).where(eq(users.id, userId)))[0]?.employeeId ?? null;

/** The signed-in person's own checks, newest first. */
export async function myWorkstationChecks(userId: string) {
  const employeeId = await employeeOfUser(userId);
  if (!employeeId) return [];
  return db.select(listed).from(workstationChecks).where(eq(workstationChecks.employeeId, employeeId)).orderBy(desc(workstationChecks.checkedAt));
}

/** "I've read it", said in the app: only for the person's own check. */
export async function readMyWorkstationCheck(id: number, actor: Actor & { id: string }) {
  const employeeId = await employeeOfUser(actor.id);
  const [row] = employeeId
    ? await db.select({ id: workstationChecks.id, readAt: workstationChecks.readAt }).from(workstationChecks).where(and(eq(workstationChecks.id, id), eq(workstationChecks.employeeId, employeeId)))
    : [];
  if (!row) throw notFound();
  if (row.readAt) return { id, readAt: row.readAt };
  const readAt = new Date();
  await db.update(workstationChecks).set({ readAt, readBy: actor.name, readOn: "app", readCodeHash: null }).where(eq(workstationChecks.id, id));
  await audit(actor, "read", "workstation_check", id, "Read their workstation check in the app");
  return { id, readAt };
}

// ------------------------------------------------------------- at Windows sign-in

type SignIn = z.infer<typeof workstationSignIn>;

/**
 * The employee a Windows account is: the one whose email is the account's UPN, else the only one
 * whose email starts with the account's name (the domain's own name, applus.local, can differ from
 * the email's, applus.com.sa). Null when none matches, or more than one could.
 */
export async function employeeForAccount({ upn, user }: Pick<SignIn, "upn" | "user">) {
  const email = upn.toLowerCase();
  if (email.includes("@")) {
    const [exact] = await db.select({ id: employees.id, name: employees.name }).from(employees).where(sql`lower(${employees.email}) = ${email}`);
    if (exact) return exact;
  }
  const names = [...new Set([email.split("@")[0], user.toLowerCase().replace(/^.*\\/, "")].filter(Boolean))];
  if (!names.length) return null;
  const found = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.active, true), inArray(sql`split_part(lower(${employees.email}), '@', 1)`, names)))
    .limit(2);
  return found.length === 1 ? found[0] : null;
}

/** Unread checks for whoever signed in: theirs if the app knows them, else the computer's. */
async function unreadFor(signIn: SignIn) {
  const employee = await employeeForAccount(signIn);
  const whose = employee ? eq(workstationChecks.employeeId, employee.id) : sql`lower(${workstationChecks.computerName}) = ${signIn.computer.toLowerCase()}`;
  return { employee, where: and(whose, isNull(workstationChecks.readAt)) };
}

/**
 * The message to show at sign-in, oldest unread first, or null. Each time it is shown it carries a
 * new one-time code, which marking it read needs: a message is only marked read by whoever saw it.
 */
export async function workstationMessageFor(signIn: SignIn) {
  const { employee, where } = await unreadFor(signIn);
  const [row] = await db.select().from(workstationChecks).where(where).orderBy(asc(workstationChecks.checkedAt)).limit(1);
  if (!row) return null;
  const code = randomBytes(24).toString("base64url");
  await db.update(workstationChecks).set({ readCodeHash: hash(code) }).where(eq(workstationChecks.id, row.id));
  const organisation = await getSetting("organisation");
  const name = employee?.name ?? row.employeeName ?? "";
  return {
    id: row.id,
    code,
    organisation: organisation.name,
    firstName: name.split(/\s+/)[0] ?? "",
    result: row.result,
    computer: row.computerName,
    checkedAt: row.checkedAt,
    checkedBy: row.checkedByName,
    message: row.message,
    // What to fix, when anything; a pass needs no list.
    toFix: row.items.filter((i) => i.state === "not_ok").map((i) => ({ en: i.labelEn, ar: i.labelAr, note: i.note })),
  };
}

/** "I've read it", from the sign-in window: the message's code, from the same person or computer. */
export async function readWorkstationMessage(id: number, input: z.infer<typeof workstationRead>) {
  const { where } = await unreadFor(input);
  const [row] = await db
    .select({ id: workstationChecks.id, readCodeHash: workstationChecks.readCodeHash, computerName: workstationChecks.computerName })
    .from(workstationChecks)
    .where(and(where, eq(workstationChecks.id, id)));
  if (!row || !row.readCodeHash || row.readCodeHash !== hash(input.code)) throw notFound();
  const account = input.upn || input.user || "unknown";
  await db
    .update(workstationChecks)
    .set({ readAt: new Date(), readBy: account, readOn: input.computer, readCodeHash: null })
    .where(and(eq(workstationChecks.id, id), isNull(workstationChecks.readAt)));
  await audit({ id: null, name: `Windows sign-in: ${account}` }, "read", "workstation_check", id, `Read the workstation check of ${row.computerName} at sign-in on ${input.computer}`);
  return { id };
}
