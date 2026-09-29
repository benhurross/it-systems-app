import type { ProjectStatus } from "./domain";

/** Past its due date and not finished. */
export function isProjectOverdue(project: { dueDate: string | null; status: ProjectStatus }, today: string) {
  return project.dueDate !== null && project.dueDate < today && project.status !== "completed";
}

/** Share of tasks done; a project with no tasks has made no progress. */
export function projectProgress(done: number, total: number) {
  return total ? done / total : 0;
}
