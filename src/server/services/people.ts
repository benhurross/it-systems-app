import { IT_ROLES } from "@/lib/permissions";
import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { OFFBOARDING_TASKS, ONBOARDING_TASKS } from "@/lib/domain";
import { onboardingComplete } from "@/lib/people";
import type { checklistUpdate, employeeInput, joinerInput, leaverInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, employees, idCards, joiners, leavers, tickets, users } from "../db/schema";
import { badRequest, one } from "../http";

// ---------------------------------------------------------------- employees

export async function listEmployees() {
  return db.select().from(employees).orderBy(asc(employees.name));
}

export async function getEmployee(id: number) {
  return one(await db.select().from(employees).where(eq(employees.id, id)));
}

/** A person as the directory shows them: the devices they hold and the tickets they raised. */
export async function employeeProfile(id: number) {
  const [employee, held, raised] = await Promise.all([
    getEmployee(id),
    db
      .select({ id: assets.id, name: assets.name, category: assets.category, type: assets.type, status: assets.status })
      .from(assets)
      .where(eq(assets.assignedTo, id))
      .orderBy(asc(assets.name)),
    db
      .select({ id: tickets.id, subject: tickets.subject, status: tickets.status, createdAt: tickets.createdAt })
      .from(tickets)
      .where(eq(tickets.requesterId, id))
      .orderBy(desc(tickets.createdAt), desc(tickets.id))
      .limit(10),
  ]);
  return { ...employee, assets: held, tickets: raised };
}

export async function createEmployee(input: z.infer<typeof employeeInput>, actor: Actor) {
  const row = one(await db.insert(employees).values(input).returning());
  await audit(actor, "create", "employee", row.id, `Added ${row.name} to the directory`);
  return row;
}

export async function updateEmployee(id: number, input: z.infer<typeof employeeInput>, actor: Actor) {
  const row = one(await db.update(employees).set(input).where(eq(employees.id, id)).returning());
  await audit(actor, "update", "employee", row.id, `Updated ${row.name}`);
  return row;
}

/** People who can be assigned work: admins and IT staff with active accounts. */
export async function listStaff() {
  return db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(inArray(users.role, [...IT_ROLES]), or(isNull(users.banned), eq(users.banned, false))))
    .orderBy(asc(users.name));
}

// ---------------------------------------------------------------- joiners

/** Only keys from the checklist are kept, so a stray field can never mark a step done. */
const pick = (tasks: Record<string, boolean>, keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, tasks[k] === true]));

export async function listJoiners() {
  return db.select().from(joiners).orderBy(desc(joiners.startDate));
}

export async function createJoiner(input: z.infer<typeof joinerInput>, actor: Actor) {
  const row = one(await db.insert(joiners).values({ ...input, tasks: {} }).returning());
  await audit(actor, "create", "joiner", row.id, `Started onboarding for ${row.name}`);
  return row;
}

export async function updateJoinerTasks(id: number, input: z.infer<typeof checklistUpdate>, actor: Actor) {
  const tasks = pick(input.tasks, ONBOARDING_TASKS.map((t) => t.key));
  const row = one(await db.update(joiners).set({ tasks }).where(and(eq(joiners.id, id), isNull(joiners.completedAt))).returning());
  await audit(actor, "update", "joiner", row.id, `Updated onboarding checklist for ${row.name}`);
  return row;
}

/** Finishing onboarding adds the new starter to the directory, in one transaction. */
export async function completeJoiner(id: number, actor: Actor) {
  let linked = false;
  const result = await db.transaction(async (tx) => {
    const joiner = one(await tx.select().from(joiners).where(eq(joiners.id, id)));
    if (joiner.completedAt) throw badRequest("Onboarding is already complete");
    if (!onboardingComplete(joiner.tasks)) throw badRequest("Finish every checklist step first");
    // Someone may have added them to the directory by hand already: that entry is theirs, kept as
    // it is but for what it lacks, and active again.
    const [existing] = await tx.select().from(employees).where(sql`lower(${employees.email}) = ${joiner.email.trim().toLowerCase()}`);
    const employee = existing
      ? one(
          await tx
            .update(employees)
            .set({
              employeeNumber: existing.employeeNumber || joiner.employeeNumber,
              phone: existing.phone || joiner.phone,
              mobile: existing.mobile || joiner.mobile,
              active: true,
            })
            .where(eq(employees.id, existing.id))
            .returning(),
        )
      : one(
          await tx
            .insert(employees)
            .values({
              name: joiner.name,
              email: joiner.email,
              department: joiner.department,
              location: joiner.location,
              jobTitle: joiner.jobTitle,
              employeeNumber: joiner.employeeNumber,
              phone: joiner.phone,
              mobile: joiner.mobile,
            })
            .returning(),
        );
    linked = !!existing;
    // Their ID card now belongs to the directory entry too.
    await tx.update(idCards).set({ employeeId: employee.id }).where(eq(idCards.joinerId, id));
    return one(
      await tx
        .update(joiners)
        .set({ employeeId: employee.id, completedAt: new Date() })
        .where(eq(joiners.id, id))
        .returning(),
    );
  });
  await audit(actor, "complete", "joiner", result.id, `Completed onboarding for ${result.name}${linked ? " (linked to their existing directory entry)" : ""}`);
  return { ...result, linked };
}

/**
 * Deletes onboarding records (one, or many chosen together), for good. Anyone already added to the
 * directory stays there, with their ID card; an ID card request started for someone still being
 * onboarded goes with their record.
 */
export async function deleteJoiners(ids: number[], actor: Actor) {
  const gone = await db.transaction(async (tx) => {
    // A card that now belongs to a directory entry is kept: only its link to onboarding is dropped.
    await tx.update(idCards).set({ joinerId: null }).where(and(inArray(idCards.joinerId, ids), isNotNull(idCards.employeeId)));
    return tx.delete(joiners).where(inArray(joiners.id, ids)).returning({ id: joiners.id, name: joiners.name, completedAt: joiners.completedAt });
  });
  for (const row of gone) {
    await audit(actor, "delete", "joiner", row.id, `Deleted the onboarding record for ${row.name}${row.completedAt ? " (they stay in the directory)" : ""}`);
  }
  return { deleted: gone.length };
}

// ---------------------------------------------------------------- leavers

export async function listLeavers() {
  return db
    .select({
      ...getTableColumns(leavers),
      name: employees.name,
      email: employees.email,
      department: employees.department,
    })
    .from(leavers)
    .innerJoin(employees, eq(employees.id, leavers.employeeId))
    .orderBy(desc(leavers.resignationDate));
}

export async function createLeaver(input: z.infer<typeof leaverInput>, actor: Actor) {
  const row = one(await db.insert(leavers).values({ ...input, tasks: {} }).returning());
  const employee = await getEmployee(row.employeeId);
  await audit(actor, "create", "leaver", row.id, `Started offboarding for ${employee.name}`);
  return row;
}

/**
 * Deletes offboarding records (one, or many chosen together), for good. The people stay in the
 * directory as they are; with `restore`, those whose completed offboarding had marked them as
 * having left are made current again.
 */
export async function deleteLeavers(ids: number[], restore: boolean, actor: Actor) {
  const gone = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(leavers)
      .where(inArray(leavers.id, ids))
      .returning({ id: leavers.id, employeeId: leavers.employeeId, completedAt: leavers.completedAt });
    const back = rows.filter((r) => r.completedAt).map((r) => r.employeeId);
    if (restore && back.length) await tx.update(employees).set({ active: true }).where(inArray(employees.id, back));
    return rows;
  });
  if (gone.length === 0) return { deleted: 0 };
  const names = new Map(
    (await db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, gone.map((r) => r.employeeId)))).map((e) => [e.id, e.name]),
  );
  for (const row of gone) {
    const back = restore && row.completedAt ? " and marked them as a current employee again" : "";
    await audit(actor, "delete", "leaver", row.id, `Deleted the offboarding record for ${names.get(row.employeeId) ?? "someone"}${back}`);
  }
  return { deleted: gone.length };
}

/** Ticking the last step completes offboarding and marks the employee inactive. */
export async function updateLeaver(
  id: number,
  input: z.infer<typeof checklistUpdate> & { notes?: string | null },
  actor: Actor,
) {
  const tasks = pick(input.tasks, OFFBOARDING_TASKS);
  const done = OFFBOARDING_TASKS.every((t) => tasks[t]);
  const row = await db.transaction(async (tx) => {
    const updated = one(
      await tx
        .update(leavers)
        .set({ tasks, notes: input.notes, completedAt: done ? new Date() : null })
        .where(eq(leavers.id, id))
        .returning(),
    );
    await tx.update(employees).set({ active: !done }).where(eq(employees.id, updated.employeeId));
    return updated;
  });
  const employee = await getEmployee(row.employeeId);
  await audit(actor, done ? "complete" : "update", "leaver", row.id, `${done ? "Completed" : "Updated"} offboarding for ${employee.name}`);
  return row;
}
