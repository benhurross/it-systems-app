import { and, asc, desc, eq, getTableColumns } from "drizzle-orm";
import type { z } from "zod";
import { ref } from "@/lib/domain";
import { can } from "@/lib/permissions";
import type { commentCreate, ticketCreate, ticketUpdate } from "@/lib/schemas";
import { dueAt } from "@/lib/sla";
import { isReopen, nextStatuses } from "@/lib/workflows";
import { audit } from "../audit";
import type { SessionUser } from "../auth";
import { db } from "../db";
import { assets, auditLog, employees, ticketComments, tickets, users } from "../db/schema";
import { badRequest, forbidden, notFound, one } from "../http";
import { getSetting } from "../settings";
import { heldAsset } from "./me";

const columns = {
  ...getTableColumns(tickets),
  requesterName: employees.name,
  requesterEmail: employees.email,
  requesterDepartment: employees.department,
  assigneeName: users.name,
};

const withNames = () =>
  db
    .select(columns)
    .from(tickets)
    .innerJoin(employees, eq(employees.id, tickets.requesterId))
    .leftJoin(users, eq(users.id, tickets.assigneeId));

/** IT sees every ticket; anyone else sees only the tickets they raised. */
function scope(user: SessionUser) {
  if (can(user.role, "it")) return undefined;
  return eq(tickets.requesterId, user.employeeId ?? -1);
}

export async function listTickets(user: SessionUser) {
  return withNames().where(scope(user)).orderBy(desc(tickets.createdAt));
}

/** One ticket with its conversation and history. Out-of-scope tickets are reported as missing. */
export async function getTicket(user: SessionUser, id: number) {
  const ticket = one(await withNames().where(and(eq(tickets.id, id), scope(user))));
  const [comments, history, asset] = await Promise.all([
    db.select().from(ticketComments).where(eq(ticketComments.ticketId, id)).orderBy(asc(ticketComments.createdAt), asc(ticketComments.id)),
    db
      .select({ id: auditLog.id, at: auditLog.at, userName: auditLog.userName, action: auditLog.action, summary: auditLog.summary })
      .from(auditLog)
      .where(and(eq(auditLog.entity, "ticket"), eq(auditLog.entityId, String(id))))
      .orderBy(asc(auditLog.at), asc(auditLog.id)),
    ticket.assetId
      ? db.select({ id: assets.id, name: assets.name }).from(assets).where(eq(assets.id, ticket.assetId))
      : [],
  ]);
  return { ...ticket, comments, history, asset: asset[0] ?? null };
}

export async function createTicket(user: SessionUser, input: z.infer<typeof ticketCreate>) {
  const it = can(user.role, "it");
  const requesterId = it ? input.requesterId : user.employeeId;
  if (!requesterId) {
    throw it ? badRequest("Choose who the ticket is for") : forbidden("Your account is not linked to an employee record");
  }
  // People outside IT describe the problem; IT sets priority and assignment. They may name one of
  // their own devices as the one affected.
  const priority = it ? input.priority : "medium";
  const now = new Date();
  const row = one(
    await db
      .insert(tickets)
      .values({
        type: input.type,
        subject: input.subject,
        description: input.description,
        issueType: input.issueType,
        location: input.location,
        priority,
        requesterId,
        assigneeId: it ? input.assigneeId : null,
        assetId: it ? input.assetId : await heldAsset(input.assetId, requesterId),
        dueAt: dueAt(now, priority, await getSetting("sla")),
        createdBy: user.id,
        createdAt: now,
      })
      .returning(),
  );
  await audit(user, "create", "ticket", row.id, `Opened ${ref("ticket", row.id)}: ${row.subject}`);
  return row;
}

export async function updateTicket(user: SessionUser, id: number, input: z.infer<typeof ticketUpdate>) {
  const current = one(await db.select().from(tickets).where(and(eq(tickets.id, id), scope(user))));
  const it = can(user.role, "it");
  if (!it && Object.keys(input).some((k) => k !== "status" && k !== "satisfaction")) throw forbidden();

  const changes: Partial<typeof tickets.$inferInsert> = {};
  const notes: string[] = [];

  if (input.status && input.status !== current.status) {
    if (!nextStatuses(user.role, current.status).includes(input.status)) {
      throw badRequest(`A ticket cannot move from ${current.status} to ${input.status}`);
    }
    changes.status = input.status;
    notes.push(`status ${input.status}`);
    if (input.status === "resolved") {
      changes.resolvedAt = new Date();
      changes.resolution = input.resolution;
    }
    if (input.status === "closed") {
      changes.closedAt = new Date();
      changes.satisfaction = input.satisfaction ?? null;
      if (input.satisfaction) notes.push(`rated ${input.satisfaction}/5`);
    }
    if (isReopen(current.status, input.status)) {
      changes.reopenCount = current.reopenCount + 1;
      changes.resolvedAt = null;
      changes.closedAt = null;
      changes.satisfaction = null;
    }
  }
  if (it) {
    if (input.priority && input.priority !== current.priority) {
      changes.priority = input.priority;
      // The SLA clock always runs from when the ticket was opened.
      changes.dueAt = dueAt(current.createdAt, input.priority, await getSetting("sla"));
      notes.push(`priority ${input.priority}`);
    }
    if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
      changes.assigneeId = input.assigneeId;
      notes.push(input.assigneeId ? "reassigned" : "unassigned");
    }
    if (input.issueType && input.issueType !== current.issueType) {
      changes.issueType = input.issueType;
      notes.push(`issue type ${input.issueType}`);
    }
    if (input.assetId !== undefined && input.assetId !== current.assetId) {
      changes.assetId = input.assetId;
      notes.push("linked asset changed");
    }
  }
  if (notes.length === 0) return current;

  const row = one(await db.update(tickets).set(changes).where(eq(tickets.id, id)).returning());
  await audit(user, "update", "ticket", id, `Updated ${ref("ticket", id)}: ${notes.join(", ")}`);
  return row;
}

export async function addComment(user: SessionUser, id: number, input: z.infer<typeof commentCreate>) {
  const [ticket] = await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.id, id), scope(user)));
  if (!ticket) throw notFound();
  const row = one(
    await db.insert(ticketComments).values({ ticketId: id, authorId: user.id, authorName: user.name, body: input.body }).returning(),
  );
  await audit(user, "comment", "ticket", id, `Commented on ${ref("ticket", id)}`);
  return row;
}
