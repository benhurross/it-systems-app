import { asc, eq } from "drizzle-orm";
import type { z } from "zod";
import type { userCreate, userUpdate } from "@/lib/schemas";
import { audit } from "../audit";
import { auth, type SessionUser } from "../auth";
import { db } from "../db";
import { employees, sessions, users } from "../db/schema";
import { badRequest, forbidden, one } from "../http";

export async function listUsers() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      banned: users.banned,
      employeeId: users.employeeId,
      employeeName: employees.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .orderBy(asc(users.name));
}

export async function createUser(input: z.infer<typeof userCreate>, actor: SessionUser) {
  const { user } = await auth.api.createUser({
    body: { name: input.name, email: input.email, password: input.password, role: input.role },
  });
  if (input.employeeId) await db.update(users).set({ employeeId: input.employeeId }).where(eq(users.id, user.id));
  await audit(actor, "create", "user", user.id, `Added ${input.name} as ${input.role}`);
  return one(await db.select().from(users).where(eq(users.id, user.id)));
}

/**
 * Role, employee link, activation and password, one at a time or together. Admins cannot change
 * their own role or deactivate themselves, so the system always keeps an administrator.
 * Deactivating ends every session at once.
 */
export async function updateUser(id: string, input: z.infer<typeof userUpdate>, actor: SessionUser) {
  const current = one(await db.select().from(users).where(eq(users.id, id)));
  if (id === actor.id && ((input.role && input.role !== current.role) || input.active === false)) {
    throw forbidden("You cannot change your own role or deactivate yourself");
  }
  const role = input.role ?? current.role;
  const employeeId = input.employeeId === undefined ? current.employeeId : input.employeeId;
  if (role === "employee" && employeeId === null) throw badRequest("validation.employeeRequired");

  const notes: string[] = [];
  await db.transaction(async (tx) => {
    if (input.role && input.role !== current.role) notes.push(`role ${input.role}`);
    if (input.employeeId !== undefined && input.employeeId !== current.employeeId) notes.push("employee link changed");
    if (input.active !== undefined && input.active === !!current.banned) {
      notes.push(input.active ? "reactivated" : "deactivated");
      if (!input.active) await tx.delete(sessions).where(eq(sessions.userId, id));
    }
    await tx
      .update(users)
      .set({ role, employeeId, banned: input.active === undefined ? current.banned : !input.active })
      .where(eq(users.id, id));
  });
  if (input.password) {
    const context = await auth.$context;
    await context.internalAdapter.updatePassword(id, await context.password.hash(input.password));
    notes.push("password reset");
  }
  if (notes.length) await audit(actor, "update", "user", id, `Updated ${current.name}: ${notes.join(", ")}`);
  return one(await db.select().from(users).where(eq(users.id, id)));
}
