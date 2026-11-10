import { desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { teamTaskInput } from "@/lib/team";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const team = await import("@/server/services/team");
const { putSetting } = await import("@/server/settings");

let manager: Awaited<ReturnType<typeof asUser>>;
let omar: Awaited<ReturnType<typeof asUser>>;
let faisal: Awaited<ReturnType<typeof asUser>>;
let itAdmin: Awaited<ReturnType<typeof asUser>>;
beforeAll(async () => {
  await seedDemo(NOW);
  [manager, omar, faisal, itAdmin] = await Promise.all(["admin@applus.test", "it@applus.test", "it2@applus.test", "it3@applus.test"].map(asUser));
}, 120_000);

const input = (more: Partial<Parameters<typeof teamTaskInput.parse>[0]> = {}) =>
  teamTaskInput.parse({ title: "Renew the firewall licence", assigneeId: omar.id, requester: "gm", priority: "high", dueDate: "2026-11-20", ...more });
const emailsTo = (to: string) => db.select().from(s.emails).where(eq(s.emails.recipient, to)).orderBy(desc(s.emails.id));

describe("team tasks", () => {
  it("are given by an Admin only, and seen by the Admins and the member they are for", async () => {
    const task = await team.createTask(input(), manager);
    expect(task).toMatchObject({ status: "todo", progress: 0, createdByName: "Sara Al-Harbi", requester: "gm" });
    await expect(team.createTask(input(), itAdmin)).rejects.toMatchObject({ status: 403 });
    await expect(team.createTask(input(), omar)).rejects.toMatchObject({ status: 403 });

    expect((await team.listTasks(manager)).some((t) => t.id === task.id)).toBe(true);
    expect((await team.listTasks(omar)).map((t) => t.id)).toContain(task.id);
    // Not someone else's, not even an IT Admin's: to them, it is not there.
    expect((await team.listTasks(faisal)).some((t) => t.id === task.id)).toBe(false);
    expect((await team.listTasks(itAdmin)).some((t) => t.id === task.id)).toBe(false);
    await expect(team.getTask(task.id, faisal)).rejects.toMatchObject({ status: 404 });
    await expect(team.actOnTask(task.id, { action: "comment", text: "Hi" }, faisal)).rejects.toMatchObject({ status: 404 });
    // Given to someone else's account or a non-IT one: refused.
    const employee = await asUser("employee@applus.test");
    await expect(team.createTask(input({ assigneeId: employee.id }), manager)).rejects.toMatchObject({ status: 400 });
    // An executive's task says whose it is.
    expect(teamTaskInput.safeParse({ ...input(), requester: "executive", requesterName: null }).success).toBe(false);
  });

  it("go from To do to Done by the member, and are confirmed or sent back by the manager", async () => {
    const task = await team.createTask(input({ title: "Patch the ERP server" }), manager);
    const started = await team.actOnTask(task.id, { action: "start" }, omar);
    expect(started).toMatchObject({ status: "in_progress" });
    expect(started.startedAt).not.toBeNull();
    expect(await team.actOnTask(task.id, { action: "progress", progress: 60, text: "Half the servers done" }, omar)).toMatchObject({ progress: 60 });
    // The member may not confirm, keep notes, or move it to Confirmed.
    await expect(team.actOnTask(task.id, { action: "confirm", text: null }, omar)).rejects.toMatchObject({ status: 403 });
    await expect(team.actOnTask(task.id, { action: "note", text: "x" }, omar)).rejects.toMatchObject({ status: 403 });
    await expect(team.actOnTask(task.id, { action: "move", status: "confirmed" }, omar)).rejects.toMatchObject({ status: 403 });

    const done = await team.actOnTask(task.id, { action: "done", text: "All patched, rebooted Sunday" }, omar);
    expect(done).toMatchObject({ status: "done", progress: 100 });
    // The manager's private note, never shown to the member.
    await team.actOnTask(task.id, { action: "note", text: "Check the reboot window with Finance" }, manager);
    const back = await team.actOnTask(task.id, { action: "return", text: "The DR server is not patched yet" }, manager);
    expect(back).toMatchObject({ status: "in_progress", doneAt: null });
    await team.actOnTask(task.id, { action: "done", text: null }, omar);
    const confirmed = await team.actOnTask(task.id, { action: "confirm", text: "Thanks" }, manager);
    expect(confirmed).toMatchObject({ status: "confirmed", confirmedByName: "Sara Al-Harbi" });
    // Confirmed: the member can no longer change it; the manager can reopen it.
    await expect(team.actOnTask(task.id, { action: "progress", progress: 10, text: null }, omar)).rejects.toMatchObject({ status: 400 });
    expect(await team.actOnTask(task.id, { action: "reopen" }, manager)).toMatchObject({ status: "in_progress" });

    const asMember = await team.getTask(task.id, omar);
    const asManager = await team.getTask(task.id, manager);
    expect(asManager.events.map((e) => e.kind)).toEqual(["created", "started", "progress", "done", "note", "returned", "done", "confirmed", "reopened"]);
    expect(asMember.events.map((e) => e.kind)).not.toContain("note");
    expect(asMember.events.find((e) => e.kind === "returned")?.text).toBe("The DR server is not patched yet");
  });

  it("move on the board as each may move them", async () => {
    const task = await team.createTask(input({ title: "Board move" }), manager);
    expect(await team.actOnTask(task.id, { action: "move", status: "in_progress" }, omar)).toMatchObject({ status: "in_progress" });
    expect(await team.actOnTask(task.id, { action: "move", status: "done" }, omar)).toMatchObject({ status: "done", progress: 100 });
    // The member may take it back from Done before it is reviewed; the manager confirms by moving it.
    expect(await team.actOnTask(task.id, { action: "move", status: "in_progress" }, omar)).toMatchObject({ status: "in_progress" });
    await team.actOnTask(task.id, { action: "move", status: "done" }, omar);
    expect(await team.actOnTask(task.id, { action: "move", status: "confirmed" }, manager)).toMatchObject({ status: "confirmed" });
  });

  it("are changed, given to someone else, and deleted by the manager only", async () => {
    const task = await team.createTask(input({ title: "Edit me", confidential: true }), manager);
    await expect(team.updateTask(task.id, input({ title: "Mine now" }), omar)).rejects.toMatchObject({ status: 403 });
    const moved = await team.updateTask(task.id, input({ title: "Edit me", assigneeId: faisal.id, confidential: true }), manager);
    expect(moved.assigneeId).toBe(faisal.id);
    expect((await team.listTasks(omar)).some((t) => t.id === task.id)).toBe(false);
    expect((await team.listTasks(faisal)).some((t) => t.id === task.id)).toBe(true);
    await expect(team.deleteTask(task.id, faisal)).rejects.toMatchObject({ status: 403 });
    await team.deleteTask(task.id, manager);
    await expect(team.getTask(task.id, manager)).rejects.toMatchObject({ status: 404 });
  });
});

describe("team emails", () => {
  it("tell the member of a task given or sent back, and the manager of one done", async () => {
    const before = { omar: (await emailsTo("it@applus.test")).length, boss: (await emailsTo("admin@applus.test")).length };
    const task = await team.createTask(input({ title: "Emails please" }), manager);
    const [given] = await emailsTo("it@applus.test");
    expect(given).toMatchObject({ kind: "team_assigned" });
    expect(given.subject).toMatch(/^A task for you: Emails please \| مهمة لك: Emails please$/);
    expect(given.html).toContain(`/en/my-work?task=${task.id}`);
    await team.actOnTask(task.id, { action: "done", text: "Finished early" }, omar);
    const [done] = await emailsTo("admin@applus.test");
    expect(done).toMatchObject({ kind: "team_done" });
    expect(done.html).toContain(`/en/team?task=${task.id}`);
    expect(done.html).toContain("Finished early");
    await team.actOnTask(task.id, { action: "return", text: "Add the screenshots" }, manager);
    expect((await emailsTo("it@applus.test"))[0]).toMatchObject({ kind: "team_returned" });
    expect((await emailsTo("it@applus.test"))[0].html).toContain("Add the screenshots");
    expect((await emailsTo("it@applus.test")).length - before.omar).toBe(2);
    expect((await emailsTo("admin@applus.test")).length - before.boss).toBe(1);
  });

  it("remind of tasks due tomorrow and overdue, once a day, from 7 in the morning", async () => {
    const tomorrow = await team.createTask(input({ title: "Due tomorrow", dueDate: "2026-11-11" }), manager);
    const late = await team.createTask(input({ title: "Late one", dueDate: "2026-11-01" }), manager);
    const later = await team.createTask(input({ title: "Next month", dueDate: "2026-12-15" }), manager);
    const dawn = new Date("2026-11-10T02:00:00Z"); // 5 in the morning in Riyadh
    expect(await team.remindDueTasks(dawn)).toBe(0);
    const morning = new Date("2026-11-10T05:00:00Z"); // 8 in the morning in Riyadh
    await team.remindDueTasks(morning);
    const sent = await db.select().from(s.emails).where(eq(s.emails.kind, "team_due"));
    const about = (title: string) => sent.filter((e) => e.subject.includes(title)).map((e) => e.recipient).toSorted();
    expect(about("Due tomorrow")).toEqual(["admin@applus.test", "it@applus.test"]);
    expect(sent.find((e) => e.subject.includes("Late one"))?.subject).toMatch(/^Task overdue/);
    expect(about("Next month")).toEqual([]);
    // Once a day.
    expect(await team.remindDueTasks(new Date("2026-11-10T09:00:00Z"))).toBe(0);
    expect((await team.getTask(tomorrow.id, manager)).remindedOn).toBe("2026-11-10");
    expect((await team.getTask(late.id, manager)).remindedOn).toBe("2026-11-10");
    expect((await team.getTask(later.id, manager)).remindedOn).toBeNull();
  });

  it("are not sent when the Admins turn them off", async () => {
    await putSetting("team", { notifyAssigned: false, notifyDone: true, notifyDue: true, notifyReturned: true }, manager);
    const before = (await emailsTo("it2@applus.test")).length;
    await team.createTask(input({ title: "Quiet", assigneeId: faisal.id }), manager);
    expect((await emailsTo("it2@applus.test")).length).toBe(before);
    await putSetting("team", { notifyAssigned: true, notifyDone: true, notifyDue: true, notifyReturned: true }, manager);
  });
});

describe("team plans and the dashboard", () => {
  it("are written by each member for themselves; the manager reads everyone's", async () => {
    const plans = await import("@/server/services/team-plans");
    const { planInput } = await import("@/lib/team");
    const exam = await plans.createPlan(planInput.parse({ kind: "exam", title: "CCNA exam", startDate: "2026-11-19", endDate: "2026-11-19" }), omar);
    await plans.createPlan(planInput.parse({ kind: "leave", title: "Annual leave", startDate: "2026-11-16", endDate: "2026-11-18" }), faisal);
    const week = { from: "2026-11-15", to: "2026-11-21" };
    expect((await plans.listPlans(omar, week)).map((p) => p.title)).toEqual(["CCNA exam"]);
    expect((await plans.listPlans(manager, week)).map((p) => p.title).toSorted()).toEqual(["Annual leave", "CCNA exam"]);
    // Outside the days asked: not listed.
    expect(await plans.listPlans(omar, { from: "2026-12-01", to: "2026-12-07" })).toEqual([]);
    // Only one's own is changed: the manager reads it, another member does not even find it.
    await expect(plans.updatePlan(exam.id, planInput.parse({ kind: "exam", title: "Moved", startDate: "2026-11-20", endDate: "2026-11-20" }), manager)).rejects.toMatchObject({ status: 403 });
    await expect(plans.deletePlan(exam.id, faisal)).rejects.toMatchObject({ status: 404 });
    expect((await plans.updatePlan(exam.id, planInput.parse({ kind: "exam", title: "CCNA exam", startDate: "2026-11-20", endDate: "2026-11-20" }), omar)).startDate).toBe("2026-11-20");
    expect(planInput.safeParse({ kind: "leave", title: "Backwards", startDate: "2026-11-20", endDate: "2026-11-19" }).success).toBe(false);
  });

  it("show the manager each member's workload, who is away, what waits for review and what is due", async () => {
    const plans = await import("@/server/services/team-plans");
    const fresh = await team.createTask(input({ title: "Dashboard task", dueDate: "2026-11-12" }), manager);
    await team.actOnTask(fresh.id, { action: "done", text: null }, omar);
    const board = await plans.teamDashboard(new Date("2026-11-16T08:00:00Z"));
    const o = board.members.find((m) => m.name === "Omar Haddad")!;
    expect(o.toReview).toBeGreaterThanOrEqual(1);
    expect(o.tickets).toBeGreaterThan(0);
    expect(board.members.find((m) => m.name === "Faisal Al-Qahtani")!.away).toEqual([{ kind: "leave", title: "Annual leave", startDate: "2026-11-16", endDate: "2026-11-18" }]);
    expect(board.toReview.some((t) => t.id === fresh.id)).toBe(true);
    expect(board.figures.toReview).toBe(board.toReview.length);
    expect(board.members.every((m) => m.progress >= 0 && m.progress <= 100)).toBe(true);
    // The manager's private notes are never in the activity.
    expect(board.activity.some((a) => a.kind === "note")).toBe(false);
  });
});
