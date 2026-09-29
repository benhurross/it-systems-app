import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { z } from "zod";
import { ref } from "@/lib/domain";
import type { projectInput, taskInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { projects, projectTasks, users } from "../db/schema";
import { one } from "../http";

const count = (status?: string) =>
  sql<number>`(select count(*) from ${projectTasks} where ${projectTasks.projectId} = ${projects.id}${
    status ? sql` and ${projectTasks.status} = ${status}` : sql``
  })`.mapWith(Number);

const withOwner = () =>
  db
    .select({ ...getTableColumns(projects), ownerName: users.name, taskCount: count(), doneCount: count("done") })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerId));

export async function listProjects() {
  return withOwner().orderBy(desc(projects.createdAt));
}

export async function getProject(id: number) {
  const project = one(await withOwner().where(eq(projects.id, id)));
  const tasks = await db
    .select({ ...getTableColumns(projectTasks), assigneeName: users.name })
    .from(projectTasks)
    .leftJoin(users, eq(users.id, projectTasks.assigneeId))
    .where(eq(projectTasks.projectId, id))
    .orderBy(asc(projectTasks.id));
  return { ...project, tasks };
}

export async function createProject(input: z.infer<typeof projectInput>, actor: Actor) {
  const row = one(await db.insert(projects).values(input).returning());
  await audit(actor, "create", "project", row.id, `Created ${ref("project", row.id)}: ${row.name}`);
  return row;
}

export async function updateProject(id: number, input: z.infer<typeof projectInput>, actor: Actor) {
  const row = one(await db.update(projects).set(input).where(eq(projects.id, id)).returning());
  await audit(actor, "update", "project", id, `Updated ${ref("project", id)}: ${row.name} (${row.status})`);
  return row;
}

export async function createTask(projectId: number, input: z.infer<typeof taskInput>, actor: Actor) {
  const row = one(await db.insert(projectTasks).values({ ...input, projectId }).returning());
  await audit(actor, "create", "project", projectId, `Added task "${row.title}" to ${ref("project", projectId)}`);
  return row;
}

export async function updateTask(id: number, input: z.infer<typeof taskInput>, actor: Actor) {
  const row = one(await db.update(projectTasks).set(input).where(eq(projectTasks.id, id)).returning());
  await audit(actor, "update", "project", row.projectId, `Task "${row.title}" is ${row.status.replace("_", " ")}`);
  return row;
}

export async function deleteTask(id: number, actor: Actor) {
  const row = one(await db.delete(projectTasks).where(eq(projectTasks.id, id)).returning());
  await audit(actor, "delete", "project", row.projectId, `Removed task "${row.title}"`);
  return row;
}
