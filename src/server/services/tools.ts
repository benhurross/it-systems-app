import { and, count, desc, eq, gte } from "drizzle-orm";
import type { z } from "zod";
import type { toolException } from "@/lib/schemas";
import { DEFAULT_TOOL_SETTING, TOOLS, type ToolKey, type ToolSetting, toolStatus } from "@/lib/tools";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { audit, type Actor } from "../audit";
import type { SessionUser } from "../auth";
import { db } from "../db";
import { employees, tickets, toolAccess, toolUses, users } from "../db/schema";
import { badRequest, forbidden, notFound, one } from "../http";
import { getSetting } from "../settings";
import { createTicket, updateTicket } from "./tickets";

// Tickets and audit entries are written in English; resolutions in English and Arabic.
const nameOf = (tool: ToolKey) => en.tools.names[tool];
const arabicName = (tool: ToolKey) => ar.tools.names[tool];

async function settingsFor() {
  const saved = await getSetting("tools");
  return (tool: ToolKey): ToolSetting => saved[tool] ?? DEFAULT_TOOL_SETTING;
}

async function departmentOf(user: SessionUser) {
  if (!user.employeeId) return { department: null, location: null };
  const [e] = await db.select({ department: employees.department, location: employees.location }).from(employees).where(eq(employees.id, user.employeeId));
  return e ?? { department: null, location: null };
}

/** What the signed-in person may do with each tool, and any request of theirs still open. */
export async function myTools(user: SessionUser) {
  const [setting, { department }, exceptions] = await Promise.all([
    settingsFor(),
    departmentOf(user),
    db.select().from(toolAccess).where(eq(toolAccess.userId, user.id)),
  ]);
  return TOOLS.map(({ key }) => {
    const exception = exceptions.find((e) => e.tool === key) ?? null;
    return { key, status: toolStatus(setting(key), department, exception?.state ?? null), ticketId: exception?.state === "requested" ? exception.ticketId : null };
  });
}

async function statusOf(user: SessionUser, tool: ToolKey) {
  return (await myTools(user)).find((t) => t.key === tool)!;
}

/** Asking for a tool that needs approval: a ticket for IT, and the request waits on it. */
export async function requestTool(user: SessionUser, tool: ToolKey, note: string | null) {
  const { status } = await statusOf(user, tool);
  if (status !== "approval") throw badRequest(status === "requested" ? "alreadyRequested" : "notRequestable");
  if (!user.employeeId) throw forbidden("Your account is not linked to an employee record");
  const { location } = await departmentOf(user);
  const ticket = await createTicket(user, {
    type: "request",
    subject: `Access to the ${nameOf(tool)} tool`,
    description: note ? `Please switch on the ${nameOf(tool)} tool for me.\n\n${note}` : `Please switch on the ${nameOf(tool)} tool for me.`,
    issueType: "login",
    location: location ?? "jeddah",
    priority: "medium",
    requesterId: user.employeeId,
    assigneeId: null,
    assetId: null,
  });
  await db
    .insert(toolAccess)
    .values({ userId: user.id, tool, state: "requested", ticketId: ticket.id })
    .onConflictDoUpdate({ target: [toolAccess.userId, toolAccess.tool], set: { state: "requested", ticketId: ticket.id, decidedBy: null } });
  await audit(user, "request", "tool", tool, `Asked for the ${nameOf(tool)} tool`);
  return { ticketId: ticket.id };
}

/** A tool produced a file. Counted for Settings; refused for someone the tool is not open to. */
export async function recordUse(user: SessionUser, tool: ToolKey) {
  const { status } = await statusOf(user, tool);
  if (status !== "allowed") throw forbidden();
  await db.insert(toolUses).values({ tool, userId: user.id });
  return { ok: true };
}

// ---------------------------------------------------------------- for admins

const USAGE_DAYS = 30;

/** Each tool's setting and use, and every person's exception, open requests first. */
export async function toolsOverview(now = new Date()) {
  const since = new Date(now.getTime() - USAGE_DAYS * 86_400_000);
  const [setting, recent, total, exceptions] = await Promise.all([
    settingsFor(),
    db.select({ tool: toolUses.tool, n: count() }).from(toolUses).where(gte(toolUses.at, since)).groupBy(toolUses.tool),
    db.select({ tool: toolUses.tool, n: count() }).from(toolUses).groupBy(toolUses.tool),
    db
      .select({
        id: toolAccess.id,
        tool: toolAccess.tool,
        state: toolAccess.state,
        ticketId: toolAccess.ticketId,
        createdAt: toolAccess.createdAt,
        updatedAt: toolAccess.updatedAt,
        decidedBy: toolAccess.decidedBy,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
      })
      .from(toolAccess)
      .innerJoin(users, eq(users.id, toolAccess.userId))
      .orderBy(desc(toolAccess.updatedAt)),
  ]);
  return {
    days: USAGE_DAYS,
    tools: TOOLS.map(({ key }) => ({
      key,
      ...setting(key),
      recentUses: recent.find((r) => r.tool === key)?.n ?? 0,
      totalUses: total.find((r) => r.tool === key)?.n ?? 0,
    })),
    requests: exceptions.filter((e) => e.state === "requested"),
    exceptions: exceptions.filter((e) => e.state !== "requested"),
  };
}

/** Allows or blocks one person, whatever the tool's setting; replaces any request of theirs. */
export async function setException(input: z.infer<typeof toolException>, actor: Actor) {
  const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, input.userId));
  if (!person) throw notFound();
  const row = one(
    await db
      .insert(toolAccess)
      .values({ userId: input.userId, tool: input.tool, state: input.state, decidedBy: actor.name })
      .onConflictDoUpdate({ target: [toolAccess.userId, toolAccess.tool], set: { state: input.state, decidedBy: actor.name } })
      .returning(),
  );
  await audit(actor, "update", "tool", input.tool, `${input.state === "allowed" ? "Allowed" : "Blocked"} the ${nameOf(input.tool)} tool for ${person.name}`);
  return row;
}

/** Back to the tool's own setting for that person. */
export async function removeException(id: number, actor: Actor) {
  const row = one(await db.delete(toolAccess).where(eq(toolAccess.id, id)).returning());
  await audit(actor, "update", "tool", row.tool, `Removed an exception for the ${nameOf(row.tool)} tool`);
  return { id };
}

const GRANTED = (tool: ToolKey) =>
  `The ${nameOf(tool)} tool is now switched on for you. Open it from Tools.\n\nتم تفعيل أداة «${arabicName(tool)}» لك. افتحها من قائمة الأدوات.`;
const DECLINED = (tool: ToolKey) =>
  `Your request for the ${nameOf(tool)} tool was not approved. Ask IT if you have questions.\n\nلم تتم الموافقة على طلبك لأداة «${arabicName(tool)}». تواصل مع قسم تقنية المعلومات إن كانت لديك أسئلة.`;

/**
 * Answers a request: granting allows the tool for that person; declining leaves the tool as it
 * was. Either way the request's ticket is resolved with the answer, which emails them.
 */
export async function decideRequest(id: number, grant: boolean, actor: SessionUser) {
  const [request] = await db.select().from(toolAccess).where(and(eq(toolAccess.id, id), eq(toolAccess.state, "requested")));
  if (!request) throw notFound();
  if (grant) await db.update(toolAccess).set({ state: "allowed", decidedBy: actor.name }).where(eq(toolAccess.id, id));
  else await db.delete(toolAccess).where(eq(toolAccess.id, id));
  const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, request.userId));
  await audit(actor, "update", "tool", request.tool, `${grant ? "Granted" : "Declined"} the ${nameOf(request.tool)} tool for ${person?.name ?? "someone"}`);

  if (request.ticketId) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, request.ticketId));
    if (ticket && ticket.status !== "resolved" && ticket.status !== "closed") {
      await updateTicket(actor, ticket.id, {
        status: "resolved",
        resolution: grant ? GRANTED(request.tool) : DECLINED(request.tool),
        ...(ticket.assigneeId ? {} : { assigneeId: actor.id }),
      });
    }
  }
  return { id, granted: grant };
}
