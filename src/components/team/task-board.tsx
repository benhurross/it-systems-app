"use client";

import { ArrowRightLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TeamTask } from "@/lib/api-types";
import { memberMayMove, TASK_STATUSES, type TaskStatus } from "@/lib/team";
import { cn } from "@/lib/utils";
import { ConfidentialMark, DueLabel, PriorityBadge, TaskProgress, useRequesterLabel } from "./task-bits";

/**
 * The tasks in four columns: To do, In progress, Done (to review), Confirmed. A card is dragged to
 * another column, or moved with its menu from the keyboard; the server says what each may move.
 */
export function TaskBoard({
  tasks,
  member = false,
  onOpen,
  onMove,
}: {
  tasks: TeamTask[];
  /** The member's own board: they move among To do, In progress and Done. */
  member?: boolean;
  onOpen: (id: number) => void;
  onMove: (task: TeamTask, to: TaskStatus) => void;
}) {
  const t = useTranslations("team");
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const mayMove = (task: TeamTask, to: TaskStatus) => (member ? memberMayMove(task.status, to) : task.status !== to);
  const label = (s: TaskStatus) => t(`${member ? "memberStatuses" : "statuses"}.${s}`);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-task-board>
      {TASK_STATUSES.map((status) => {
        const column = tasks.filter((x) => x.status === status);
        const dragged = tasks.find((x) => x.id === dragging);
        const accepts = !!dragged && mayMove(dragged, status);
        return (
          <section
            key={status}
            aria-label={label(status)}
            data-column={status}
            onDragOver={(e) => {
              if (!accepts) return;
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              if (dragged && accepts) onMove(dragged, status);
              setDragging(null);
            }}
            className={cn("flex min-h-40 flex-col gap-2 rounded-xl border bg-muted/40 p-2 transition-colors", over === status && "border-primary bg-primary/5")}
          >
            <h2 className="flex items-center justify-between px-1 pt-1 text-sm font-semibold">
              {label(status)}
              <span className="rounded-full bg-background px-2 text-xs font-medium tabular-nums text-muted-foreground">{column.length}</span>
            </h2>
            {column.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">{t("empty")}</p>}
            {column.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                member={member}
                moves={TASK_STATUSES.filter((s) => mayMove(task, s))}
                label={label}
                onOpen={() => onOpen(task.id)}
                onMove={(to) => onMove(task, to)}
                onDragStart={() => setDragging(task.id)}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  member,
  moves,
  label,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  task: TeamTask;
  member: boolean;
  moves: TaskStatus[];
  label: (s: TaskStatus) => string;
  onOpen: () => void;
  onMove: (to: TaskStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const t = useTranslations("team");
  const requester = useRequesterLabel();
  return (
    <article
      draggable={moves.length > 0}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(task.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      data-task={task.id}
      className="group rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 text-start text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
          {task.title}
        </button>
        {moves.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-me-1 -mt-1 size-7 shrink-0" aria-label={t("actions.moveTask", { title: task.title })}>
                <ArrowRightLeft className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{task.title}</DropdownMenuLabel>
              {moves.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => onMove(s)}>
                  {t("actions.move", { status: label(s) })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {!member && task.assigneeName && <span className="font-medium text-foreground">{task.assigneeName}</span>}
        <span>{t("from", { name: requester(task) })}</span>
        {task.confidential && <ConfidentialMark />}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <PriorityBadge priority={task.priority} />
        <DueLabel task={task} />
      </div>
      {task.status !== "todo" && <TaskProgress value={task.progress} done={task.status === "confirmed"} className="mt-2" />}
    </article>
  );
}
