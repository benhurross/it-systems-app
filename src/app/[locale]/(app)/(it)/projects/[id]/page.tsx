"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useState, type DragEvent, type ReactNode } from "react";
import { EnumBadge } from "@/components/badges";
import { TaskProgress } from "@/components/projects/progress-cell";
import { ProjectDialog, TaskDialog, toTaskInput } from "@/components/projects/project-dialogs";
import { StatusBadge } from "@/components/status-badge";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { ProjectDetail } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { TASK_STATUSES, type TaskStatus } from "@/lib/domain";
import { isProjectOverdue } from "@/lib/projects";
import { cn } from "@/lib/utils";

type Task = ProjectDetail["tasks"][number];

export default function ProjectPage({ params }: PageProps<"/[locale]/projects/[id]">) {
  const { id } = use(params);
  const t = useTranslations();
  const format = useFormat();
  const [dialog, setDialog] = useState<"edit" | "task" | Task | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const { data: project, isLoading } = useApi<ProjectDetail>(`/projects/${id}`);
  const move = useApiMutation(({ task, status }: { task: Task; status: TaskStatus }) =>
    api(`/tasks/${task.id}`, { method: "PATCH", body: { ...toTaskInput(task), status } }),
  );
  const remove = useApiMutation((task: Task) => api(`/tasks/${task.id}`, { method: "DELETE" }), {
    success: t("projects.taskDeleted"),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!project) return <StatusPage kind="notFound" home="/projects" />;

  const drop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const task = project.tasks.find((x) => x.id === Number(e.dataTransfer.getData("text/plain")));
    if (task && task.status !== status) move.mutate({ task, status });
  };

  return (
    <div className="space-y-6">
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("projects.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <EnumBadge kind="projectStatus" value={project.status} />
            {isProjectOverdue(project, isoDate()) && <StatusBadge tone="danger">{t("projects.overdue")}</StatusBadge>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && <p className="max-w-2xl text-muted-foreground">{project.description}</p>}
        </div>
        <Button variant="outline" onClick={() => setDialog("edit")}>
          <Pencil />
          {t("common.edit")}
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={t("projects.owner")}>{project.ownerName ?? "—"}</Fact>
          <Fact label={t("projects.start")}>{project.startDate ? format.date(project.startDate) : "—"}</Fact>
          <Fact label={t("projects.due")}>{project.dueDate ? format.date(project.dueDate) : "—"}</Fact>
          <Fact label={t("projects.tasksDone", { done: format.number(project.doneCount), total: format.number(project.taskCount) })}>
            <TaskProgress done={project.doneCount} total={project.taskCount} />
          </Fact>
        </CardContent>
      </Card>

      <section aria-labelledby="board">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="board" className="text-lg font-semibold">
            {t("projects.board")}
          </h2>
          <Button size="sm" onClick={() => setDialog("task")}>
            <Plus />
            {t("projects.addTask")}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {TASK_STATUSES.map((status, index) => {
            const tasks = project.tasks.filter((task) => task.status === status);
            const neighbours = [TASK_STATUSES[index - 1], TASK_STATUSES[index + 1]] as const;
            return (
              <div
                key={status}
                role="group"
                aria-labelledby={`column-${status}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(status);
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={drop(status)}
                className={cn("rounded-xl border bg-muted/40 p-3 transition-colors", dropTarget === status && "border-primary bg-brand-soft")}
              >
                <h3 id={`column-${status}`} className="mb-3 flex items-center justify-between text-sm font-medium">
                  {t(`enums.taskStatus.${status}`)}
                  <span className="text-muted-foreground tabular-nums">{format.number(tasks.length)}</span>
                </h3>
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li
                      key={task.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(task.id))}
                      className="cursor-grab rounded-lg border bg-card p-3 shadow-xs active:cursor-grabbing"
                    >
                      <button type="button" onClick={() => setDialog(task)} className="text-start text-sm font-medium hover:text-primary">
                        {task.title}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {task.assigneeName ?? t("projects.unassigned")}
                        {task.dueDate && ` · ${format.date(task.dueDate)}`}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex gap-1">
                          {neighbours.map((to, side) =>
                            to ? (
                              <Button
                                key={to}
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("projects.moveTo", { title: task.title, status: t(`enums.taskStatus.${to}`) })}
                                onClick={() => move.mutate({ task, status: to })}
                              >
                                {side === 0 ? <ChevronLeft className="rtl:rotate-180" /> : <ChevronRight className="rtl:rotate-180" />}
                              </Button>
                            ) : null,
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("projects.deleteTask", { title: task.title })}
                          onClick={() => remove.mutate(task)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  ))}
                  {tasks.length === 0 && (
                    <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{t("projects.empty")}</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {dialog === "edit" && <ProjectDialog project={project} onClose={() => setDialog(null)} />}
      {dialog === "task" && <TaskDialog projectId={project.id} onClose={() => setDialog(null)} />}
      {typeof dialog === "object" && dialog !== null && <TaskDialog projectId={project.id} task={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground">{label}</p>
      <div className="font-medium">{children}</div>
    </div>
  );
}
