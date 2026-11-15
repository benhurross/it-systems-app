import { asc, eq, ne } from "drizzle-orm";
import type { z } from "zod";
import { can } from "@/lib/permissions";
import type { userCreate, userUpdate } from "@/lib/schemas";
import { audit } from "../audit";
import { auth, type SessionUser } from "../auth";
import { endSessions } from "../sessions";
import { db } from "../db";
import { employees, sessions, users } from "../db/schema";
import { badRequest, forbidden, notFound, one } from "../http";

/** The accounts: all, for an Admin; for an IT Admin, those at their level or below, without the Admins. */
export async function listUsers(actor?: Pick<SessionUser, "role">) {
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
    .where(actor && !can(actor.role, "manager") ? ne(users.role, "admin") : undefined)
    .orderBy(asc(users.name));
}

/**
 * Only an Admin makes someone an Admin or changes an Admin's account (role, activation, password,
 * employee link): an IT Admin, who manages every other account, cannot raise anyone, themselves
 * included, above their own role. To them an Admin's account is not there at all.
 */
function mayManage(actor: SessionUser, target: { role: string | null } | null, role?: string) {
  if (can(actor.role, "manager")) return;
  if (target?.role === "admin") throw notFound();
  if (role === "admin") throw forbidden("Only an Admin can give the Admin role");
}

/** An account the actor may manage; an Admin's, to an IT Admin, is not there. */
export async function checkManage(id: string, actor: SessionUser) {
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (!target) throw notFound();
  mayManage(actor, target);
}

export async function createUser(input: z.infer<typeof userCreate>, actor: SessionUser) {
  mayManage(actor, null, input.role);
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
 * Deactivating, or a new password, ends every sign-in at once.
 */
export async function updateUser(id: string, input: z.infer<typeof userUpdate>, actor: SessionUser, currentSessionId?: string) {
  const current = one(await db.select().from(users).where(eq(users.id, id)));
  mayManage(actor, current, input.role);
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
    // A new password ends the account's sign-ins everywhere (but the one making the change, for one's own).
    await endSessions(id, id === actor.id ? currentSessionId : undefined);
    notes.push("password reset, signed out everywhere");
  }
  if (notes.length) await audit(actor, "update", "user", id, `Updated ${current.name}: ${notes.join(", ")}`);
  return one(await db.select().from(users).where(eq(users.id, id)));
}
