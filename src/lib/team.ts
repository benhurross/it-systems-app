import { z } from "zod";

/**
 * Team Management: the tasks the IT manager gives the team, from himself or on behalf of the
 * executives, and the plans the team writes for themselves. A task goes To do → In progress →
 * Done (to review) → Confirmed; the manager confirms it, or sends it back to In progress.
 */

export const TASK_STATUSES = ["todo", "in_progress", "done", "confirmed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
/** Who asked for a task: the IT manager, an executive by title, or someone named. */
export const REQUESTERS = ["it_manager", "ceo", "gm", "dgm", "executive", "other"] as const;
export type Requester = (typeof REQUESTERS)[number];
/** What appears in a task's timeline. A note is the manager's own, never shown to the member. */
export const TASK_EVENTS = ["created", "edited", "reassigned", "started", "progress", "comment", "note", "done", "confirmed", "returned", "reopened", "moved"] as const;
export type TaskEventKind = (typeof TASK_EVENTS)[number];

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const day = z.iso.date().nullish().transform((v) => v ?? null);

export const teamTaskInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: text(5000),
    assigneeId: z.string().min(1),
    requester: z.enum(REQUESTERS),
    /** The executive's title ("CFO") or the person's name, for "executive" and "other". */
    requesterName: text(120),
    priority: z.enum(TASK_PRIORITIES),
    dueDate: day,
    confidential: z.boolean().default(false),
    projectId: z.number().int().positive().nullish().transform((v) => v ?? null),
  })
  .refine((t) => (t.requester !== "executive" && t.requester !== "other") || !!t.requesterName, {
    message: "validation.requesterName",
    path: ["requesterName"],
  });
export type TeamTaskInput = z.output<typeof teamTaskInput>;

/** What someone does to a task. The member: start, progress, comment, done, move; the manager, all. */
export const taskAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("progress"), progress: z.number().int().min(0).max(100), text: text(2000) }),
  z.object({ action: z.literal("comment"), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("note"), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("done"), text: text(2000) }),
  z.object({ action: z.literal("confirm"), text: text(2000) }),
  z.object({ action: z.literal("return"), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("reopen") }),
  /** Dragged on the board to another column. */
  z.object({ action: z.literal("move"), status: z.enum(TASK_STATUSES) }),
]);
export type TaskAction = z.output<typeof taskAction>;

export const teamSettings = z.object({
  notifyAssigned: z.boolean().default(true),
  notifyDone: z.boolean().default(true),
  notifyDue: z.boolean().default(true),
  notifyReturned: z.boolean().default(true),
});
export type TeamSettings = z.output<typeof teamSettings>;
export const DEFAULT_TEAM_SETTINGS: TeamSettings = { notifyAssigned: true, notifyDone: true, notifyDue: true, notifyReturned: true };

/** Overdue: past its due date and not finished (done or confirmed). */
export const isOverdue = (t: { status: TaskStatus; dueDate: string | null }, today: string) =>
  !!t.dueDate && t.dueDate < today && (t.status === "todo" || t.status === "in_progress");

/** Which moves on the board a member may make: among their own To do, In progress and Done. */
export function memberMayMove(from: TaskStatus, to: TaskStatus) {
  return from !== "confirmed" && to !== "confirmed" && from !== to;
}

/** What a plan entry is: planned work, or time a member is busy or away. */
export const PLAN_KINDS = ["work", "exam", "training", "leave", "out_of_office", "other"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];
/** The kinds that make a member busy or away: the manager gives them lighter work then. */
export const AWAY_KINDS: readonly PlanKind[] = ["exam", "training", "leave", "out_of_office"];

export const planInput = z
  .object({
    kind: z.enum(PLAN_KINDS),
    title: z.string().trim().min(1).max(200),
    note: text(2000),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  })
  .refine((p) => p.endDate >= p.startDate, { message: "validation.endBeforeStart", path: ["endDate"] });
export type PlanInput = z.output<typeof planInput>;
