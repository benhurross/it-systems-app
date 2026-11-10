import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { isPlaceholderEmail } from "@/lib/people";
import { can, IT_ROLES } from "@/lib/permissions";
import { addDays, isoDate } from "@/lib/dates";
import { memberMayMove, type TaskAction, type TaskEventKind, type TaskStatus, type TeamTaskInput } from "@/lib/team";
import { db } from "../db";
import { projects, teamTaskEvents, teamTasks, users } from "../db/schema";
import { badRequest, forbidden, notFound, one } from "../http";
import { getMailConfig } from "../mail/config";
import { queueEmail } from "../mail/outbox";
import { teamTaskEmail, type Locale, type TeamEmailKind } from "../mail/templates";
import { getSetting } from "../settings";
import type { SessionUser } from "../auth";

/**
 * Team Management's tasks. The Admins (the IT manager) see and do everything; a member sees only
 * the tasks given to them, and moves them along, but never the manager's notes. Every rule is held
 * here, for each request: the pages only follow it.
 */

type Actor = Pick<SessionUser, "id" | "name" | "role">;
type Task = typeof teamTasks.$inferSelect;

const isManager = (actor: Actor) => can(actor.role, "manager");

const assignee = users;
const columns = {
  task: teamTasks,
  assigneeName: assignee.name,
  projectName: projects.name,
};

/** The tasks the actor may see: all, for the manager; their own, for anyone else in IT. */
export async function listTasks(actor: Actor) {
  const rows = await db
    .select(columns)
    .from(teamTasks)
    .leftJoin(assignee, eq(assignee.id, teamTasks.assigneeId))
    .leftJoin(projects, eq(projects.id, teamTasks.projectId))
    .where(isManager(actor) ? undefined : eq(teamTasks.assigneeId, actor.id))
    .orderBy(asc(teamTasks.dueDate), desc(teamTasks.id));
  return rows.map((r) => ({ ...r.task, assigneeName: r.assigneeName, projectName: r.projectName }));
}

async function visibleTask(id: number, actor: Actor): Promise<Task> {
  const [task] = await db.select().from(teamTasks).where(eq(teamTasks.id, id));
  // Someone else's task is, to a member, not there at all.
  if (!task || (!isManager(actor) && task.assigneeId !== actor.id)) throw notFound();
  return task;
}

/** A task with its timeline; the manager's notes only for the manager. */
export async function getTask(id: number, actor: Actor) {
  await visibleTask(id, actor);
  const [row] = await db
    .select(columns)
    .from(teamTasks)
    .leftJoin(assignee, eq(assignee.id, teamTasks.assigneeId))
    .leftJoin(projects, eq(projects.id, teamTasks.projectId))
    .where(eq(teamTasks.id, id));
  const events = await db
    .select()
    .from(teamTaskEvents)
    .where(isManager(actor) ? eq(teamTaskEvents.taskId, id) : and(eq(teamTaskEvents.taskId, id), inArray(teamTaskEvents.kind, MEMBER_EVENTS)))
    .orderBy(asc(teamTaskEvents.at), asc(teamTaskEvents.id));
  return { ...row.task, assigneeName: row.assigneeName, projectName: row.projectName, events };
}
/** Every kind of event but the manager's private notes. */
const MEMBER_EVENTS: TaskEventKind[] = ["created", "edited", "reassigned", "started", "progress", "comment", "done", "confirmed", "returned", "reopened", "moved"];

/** The people a task can be given to: the IT team's active accounts. */
export async function listAssignees() {
  return db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(inArray(users.role, [...IT_ROLES]), or(isNull(users.banned), eq(users.banned, false))))
    .orderBy(asc(users.name));
}

async function checkAssignee(id: string) {
  if (!(await listAssignees()).some((a) => a.id === id)) throw badRequest("A linked record does not exist");
}

async function event(taskId: number, actor: Actor, kind: TaskEventKind, more: { text?: string | null; progress?: number | null; detail?: string | null } = {}) {
  await db.insert(teamTaskEvents).values({ taskId, kind, userId: actor.id, userName: actor.name, text: more.text ?? null, progress: more.progress ?? null, detail: more.detail ?? null });
}

export async function createTask(input: TeamTaskInput, actor: Actor) {
  if (!isManager(actor)) throw forbidden();
  await checkAssignee(input.assigneeId);
  const task = one(await db.insert(teamTasks).values({ ...input, createdById: actor.id, createdByName: actor.name }).returning());
  await event(task.id, actor, "created");
  if (task.assigneeId !== actor.id) await notify("assigned", task, { who: actor.name });
  return task;
}

/** The manager's change of what the task is; given to someone else, they are told. */
export async function updateTask(id: number, input: TeamTaskInput, actor: Actor) {
  if (!isManager(actor)) throw forbidden();
  const before = await visibleTask(id, actor);
  await checkAssignee(input.assigneeId);
  const task = one(await db.update(teamTasks).set(input).where(eq(teamTasks.id, id)).returning());
  if (before.assigneeId !== task.assigneeId) {
    await event(id, actor, "reassigned");
    if (task.assigneeId !== actor.id) await notify("assigned", task, { who: actor.name });
  } else await event(id, actor, "edited");
  return task;
}

export async function deleteTask(id: number, actor: Actor) {
  if (!isManager(actor)) throw forbidden();
  one(await db.delete(teamTasks).where(eq(teamTasks.id, id)).returning({ id: teamTasks.id }));
  return { id };
}

/** Moves a task to a status, with what that means: when it started, was done, was confirmed. */
function statusChange(task: Task, to: TaskStatus, actor: Actor): Partial<Task> {
  const now = new Date();
  switch (to) {
    case "todo":
      return { status: to };
    case "in_progress":
      return { status: to, startedAt: task.startedAt ?? now, doneAt: null, confirmedAt: null, confirmedByName: null };
    case "done":
      return { status: to, startedAt: task.startedAt ?? now, doneAt: now, progress: 100, confirmedAt: null, confirmedByName: null };
    case "confirmed":
      return { status: to, progress: 100, doneAt: task.doneAt ?? now, confirmedAt: now, confirmedByName: actor.name };
  }
}

/**
 * What the member or the manager does to a task. The member: start it, set its progress, comment,
 * mark it done, move it among To do, In progress and Done. The manager also confirms it, sends it
 * back with a comment, reopens it, and keeps private notes.
 */
export async function actOnTask(id: number, action: TaskAction, actor: Actor) {
  const task = await visibleTask(id, actor);
  const manager = isManager(actor);
  const managerOnly = () => {
    if (!manager) throw forbidden();
  };
  const set = async (values: Partial<Task>) => one(await db.update(teamTasks).set(values).where(eq(teamTasks.id, id)).returning());
  if (task.status === "confirmed" && !manager) throw badRequest("invalidAction");

  switch (action.action) {
    case "start":
      if (task.status !== "todo") throw badRequest("invalidAction");
      await set(statusChange(task, "in_progress", actor));
      await event(id, actor, "started");
      break;
    case "progress": {
      const values: Partial<Task> = { progress: action.progress };
      if (task.status === "todo" && action.progress > 0) Object.assign(values, statusChange(task, "in_progress", actor), { progress: action.progress });
      await set(values);
      await event(id, actor, "progress", { progress: action.progress, text: action.text });
      break;
    }
    case "comment":
      await event(id, actor, "comment", { text: action.text });
      break;
    case "note":
      managerOnly();
      await event(id, actor, "note", { text: action.text });
      break;
    case "done": {
      if (task.status === "done" || task.status === "confirmed") throw badRequest("invalidAction");
      const done = await set(statusChange(task, "done", actor));
      await event(id, actor, "done", { text: action.text });
      await notifyManagers(done, actor, action.text ?? null);
      break;
    }
    case "confirm":
      managerOnly();
      if (task.status !== "done") throw badRequest("invalidAction");
      await set(statusChange(task, "confirmed", actor));
      await event(id, actor, "confirmed", { text: action.text });
      break;
    case "return": {
      managerOnly();
      if (task.status !== "done" && task.status !== "confirmed") throw badRequest("invalidAction");
      const back = await set(statusChange(task, "in_progress", actor));
      await event(id, actor, "returned", { text: action.text });
      if (back.assigneeId && back.assigneeId !== actor.id) await notify("returned", back, { who: actor.name, comment: action.text });
      break;
    }
    case "reopen":
      managerOnly();
      if (task.status !== "confirmed") throw badRequest("invalidAction");
      await set(statusChange(task, "in_progress", actor));
      await event(id, actor, "reopened");
      break;
    case "move": {
      const to = action.status;
      if (to === task.status) break;
      // Into Done is marking it done; out of Done or Confirmed, by the manager, is sending it back.
      if (to === "done") return actOnTask(id, { action: "done", text: null }, actor);
      if (to === "confirmed") return actOnTask(id, { action: "confirm", text: null }, actor);
      if (!manager && !memberMayMove(task.status, to)) throw forbidden();
      await set(statusChange(task, to, actor));
      await event(id, actor, "moved", { detail: `${task.status}>${to}` });
      break;
    }
  }
  return getTask(id, actor);
}

// ---------------------------------------------------------------- emails

async function emailOf(userId: string | null) {
  if (!userId) return null;
  const [u] = await db.select({ email: users.email, name: users.name, banned: users.banned }).from(users).where(eq(users.id, userId));
  return u && !u.banned && !isPlaceholderEmail(u.email) ? u : null;
}

async function facts(task: Task) {
  const person = task.assigneeId ? (await db.select({ name: users.name }).from(users).where(eq(users.id, task.assigneeId)))[0] : undefined;
  return { title: task.title, requester: task.requester, requesterName: task.requesterName, priority: task.priority, dueDate: task.dueDate, assignee: person?.name ?? null };
}

const SETTING_OF: Record<TeamEmailKind, "notifyAssigned" | "notifyDone" | "notifyDue" | "notifyReturned"> = {
  assigned: "notifyAssigned",
  returned: "notifyReturned",
  done: "notifyDone",
  due: "notifyDue",
  overdue: "notifyDue",
};
const KIND_OF: Record<TeamEmailKind, "team_assigned" | "team_done" | "team_due" | "team_returned"> = {
  assigned: "team_assigned",
  returned: "team_returned",
  done: "team_done",
  due: "team_due",
  overdue: "team_due",
};

/** Emails people about a task, as Team Management's settings allow; a mail problem never fails the change. */
async function send(kind: TeamEmailKind, task: Task, to: { email: string; manager: boolean }[], p: { who: string; comment?: string | null }) {
  try {
    if (!to.length || !(await getSetting("team"))[SETTING_OF[kind]]) return;
    const [{ appUrl }, f] = await Promise.all([getMailConfig(), facts(task)]);
    await queueEmail(
      to.map((r) => ({
        kind: KIND_OF[kind],
        to: r.email,
        ...teamTaskEmail(kind, { task: f, who: p.who, comment: p.comment, open: (locale: Locale) => `${appUrl}/${locale}/${r.manager ? "team" : "my-work"}?task=${task.id}` }),
      })),
    );
  } catch (error) {
    console.error(`Could not prepare the team ${kind} email:`, error);
  }
}

/** To the member it is for. */
async function notify(kind: "assigned" | "returned", task: Task, p: { who: string; comment?: string | null }) {
  const member = await emailOf(task.assigneeId);
  if (member) await send(kind, task, [{ email: member.email, manager: false }], p);
}

/** Done, to review: to the Admin who gave it, else every Admin; not to the one who did it. */
async function notifyManagers(task: Task, actor: Actor, comment: string | null) {
  const giver = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, task.createdById ?? ""));
  const ids = giver[0] && can(giver[0].role, "manager") ? [giver[0].id] : (await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"))).map((u) => u.id);
  const people = (await Promise.all(ids.filter((i) => i !== actor.id).map(emailOf))).filter((u) => u !== null);
  await send("done", task, people.map((u) => ({ email: u.email, manager: true })), { who: actor.name, comment });
}

/**
 * Once a day, from 7 in the morning in Riyadh: the tasks due tomorrow, and every one overdue, to
 * the manager who gave them and the member they are for. Each task once a day.
 */
export async function remindDueTasks(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 7) return 0;
  const today = isoDate(now);
  const due = await db
    .select()
    .from(teamTasks)
    .where(
      and(
        inArray(teamTasks.status, ["todo", "in_progress"]),
        lte(teamTasks.dueDate, addDays(today, 1)),
        or(isNull(teamTasks.remindedOn), lte(teamTasks.remindedOn, addDays(today, -1))),
      ),
    );
  for (const task of due) {
    // Marked first, so a mail problem never repeats it within the minute.
    await db.update(teamTasks).set({ remindedOn: today }).where(eq(teamTasks.id, task.id));
    // Due today or tomorrow: due; past its day: overdue.
    const kind: TeamEmailKind = task.dueDate! < today ? "overdue" : "due";
    const [giver, member] = await Promise.all([emailOf(task.createdById), emailOf(task.assigneeId)]);
    const to = [...(giver ? [{ email: giver.email, manager: true }] : []), ...(member && member.email !== giver?.email ? [{ email: member.email, manager: false }] : [])];
    await send(kind, task, to, { who: member?.name ?? "" });
  }
  return due.length;
}
