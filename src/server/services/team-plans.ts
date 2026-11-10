import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { addDays, isoDate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { isOverdue, type PlanInput } from "@/lib/team";
import { db } from "../db";
import { projectTasks, teamPlans, teamTaskEvents, teamTasks, tickets, users } from "../db/schema";
import { forbidden, notFound, one } from "../http";
import type { SessionUser } from "../auth";
import { listAssignees } from "./team";

/**
 * The team's plans, and the manager's dashboard. A member writes and sees their own plan; the
 * Admins see everyone's, with the workload behind it: tasks, tickets and project tasks.
 */

type Actor = Pick<SessionUser, "id" | "name" | "role">;
const isManager = (actor: Actor) => can(actor.role, "manager");

/** Plan entries touching the days from `from` to `to`: everyone's for the manager, else one's own. */
export async function listPlans(actor: Actor, range: { from: string; to: string }) {
  return db
    .select({ plan: teamPlans, userName: users.name })
    .from(teamPlans)
    .innerJoin(users, eq(users.id, teamPlans.userId))
    .where(
      and(
        isManager(actor) ? undefined : eq(teamPlans.userId, actor.id),
        lte(teamPlans.startDate, range.to),
        gte(teamPlans.endDate, range.from),
      ),
    )
    .orderBy(asc(teamPlans.startDate), asc(users.name))
    .then((rows) => rows.map((r) => ({ ...r.plan, userName: r.userName })));
}

export async function createPlan(input: PlanInput, actor: Actor) {
  return one(await db.insert(teamPlans).values({ ...input, userId: actor.id }).returning());
}

/** One's own entry only: the manager reads the team's plans, the member writes theirs. */
async function ownPlan(id: number, actor: Actor) {
  const [plan] = await db.select().from(teamPlans).where(eq(teamPlans.id, id));
  if (!plan || (plan.userId !== actor.id && !isManager(actor))) throw notFound();
  if (plan.userId !== actor.id) throw forbidden();
  return plan;
}

export async function updatePlan(id: number, input: PlanInput, actor: Actor) {
  await ownPlan(id, actor);
  return one(await db.update(teamPlans).set(input).where(eq(teamPlans.id, id)).returning());
}

export async function deletePlan(id: number, actor: Actor) {
  await ownPlan(id, actor);
  await db.delete(teamPlans).where(eq(teamPlans.id, id));
  return { id };
}

const OPEN_TICKETS = ["open", "in_progress", "on_hold"] as const;

/**
 * The manager's view of the team: the figures, each member's workload (tasks, tickets, project
 * tasks, and who is away this week), what is waiting for review, due soon, and what happened lately.
 */
export async function teamDashboard(now = new Date()) {
  const today = isoDate(now);
  const weekEnd = addDays(today, 7);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [people, tasks, ticketRows, projectRows, away, activity] = await Promise.all([
    listAssignees(),
    db.select().from(teamTasks),
    db
      .select({ assigneeId: tickets.assigneeId, open: count(), overdue: sql<number>`count(*) filter (where ${tickets.dueAt} < now())`.mapWith(Number) })
      .from(tickets)
      .where(and(isNotNull(tickets.assigneeId), inArray(tickets.status, [...OPEN_TICKETS])))
      .groupBy(tickets.assigneeId),
    db
      .select({ assigneeId: projectTasks.assigneeId, open: count() })
      .from(projectTasks)
      .where(and(isNotNull(projectTasks.assigneeId), notInArray(projectTasks.status, ["done"])))
      .groupBy(projectTasks.assigneeId),
    db.select().from(teamPlans).where(and(lte(teamPlans.startDate, weekEnd), gte(teamPlans.endDate, today), inArray(teamPlans.kind, ["exam", "training", "leave", "out_of_office"]))),
    db
      .select({ id: teamTaskEvents.id, kind: teamTaskEvents.kind, userName: teamTaskEvents.userName, at: teamTaskEvents.at, taskId: teamTaskEvents.taskId, title: teamTasks.title, progress: teamTaskEvents.progress })
      .from(teamTaskEvents)
      .innerJoin(teamTasks, eq(teamTasks.id, teamTaskEvents.taskId))
      .where(notInArray(teamTaskEvents.kind, ["note"]))
      .orderBy(desc(teamTaskEvents.at), desc(teamTaskEvents.id))
      .limit(15),
  ]);
  const open = tasks.filter((t) => t.status !== "confirmed");
  const figures = {
    open: open.length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    toReview: tasks.filter((t) => t.status === "done").length,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    dueThisWeek: open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd).length,
    confidential: open.filter((t) => t.confidential).length,
    confirmedThisMonth: tasks.filter((t) => t.confirmedAt && isoDate(t.confirmedAt) >= monthStart).length,
  };
  const members = people.map((p) => {
    const mine = tasks.filter((t) => t.assigneeId === p.id);
    // This month's: what is still open, and what was confirmed since the 1st.
    const counted = mine.filter((t) => t.status !== "confirmed" || (t.confirmedAt && isoDate(t.confirmedAt) >= monthStart));
    const confirmed = counted.filter((t) => t.status === "confirmed").length;
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      todo: mine.filter((t) => t.status === "todo").length,
      inProgress: mine.filter((t) => t.status === "in_progress").length,
      toReview: mine.filter((t) => t.status === "done").length,
      overdue: mine.filter((t) => isOverdue(t, today)).length,
      confirmed,
      /** Confirmed this month against all this month's: the member's progress. */
      progress: counted.length ? Math.round((confirmed / counted.length) * 100) : 0,
      tickets: ticketRows.find((r) => r.assigneeId === p.id)?.open ?? 0,
      ticketsOverdue: ticketRows.find((r) => r.assigneeId === p.id)?.overdue ?? 0,
      projectTasks: projectRows.find((r) => r.assigneeId === p.id)?.open ?? 0,
      away: away.filter((a) => a.userId === p.id).map((a) => ({ kind: a.kind, title: a.title, startDate: a.startDate, endDate: a.endDate })),
    };
  });
  // An Admin (the manager) is listed only with work of their own: tasks, tickets, plans.
  const busy = (m: (typeof members)[number]) => m.role !== "admin" || m.todo + m.inProgress + m.toReview + m.confirmed + m.tickets + m.projectTasks + m.away.length > 0;
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  const brief = (t: (typeof tasks)[number]) => ({ id: t.id, title: t.title, assigneeName: name(t.assigneeId), dueDate: t.dueDate, priority: t.priority, status: t.status, confidential: t.confidential });
  return {
    figures,
    members: members.filter(busy),
    toReview: tasks.filter((t) => t.status === "done").toSorted((a, b) => +new Date(a.doneAt ?? 0) - +new Date(b.doneAt ?? 0)).map(brief),
    upcoming: open
      .filter((t) => t.status !== "done" && t.dueDate && t.dueDate <= weekEnd)
      .toSorted((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .map(brief),
    activity,
  };
}
