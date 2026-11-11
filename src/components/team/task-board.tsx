"use client";

import { CalendarClock, Lock, MessageSquare, MoreHorizontal, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFormat } from "@/hooks/use-format";
import type { TeamTask } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { formatWith } from "@/lib/format";
import { isOverdue, memberMayMove, TASK_STATUSES, type TaskStatus } from "@/lib/team";
import { cn } from "@/lib/utils";
import { PriorityBadge, useRequesterLabel } from "./task-bits";

/**
 * The tasks as a Kanban board: To do, In progress, Done (to review), Confirmed, each column in its
 * own soft colour. A card is dragged to another column, or moved with its menu from the keyboard;
 * the server says what each person may move. Four columns side by side where there is room; two
 * by two, or one under another, on a narrower screen or with larger text: the page never scrolls
 * sideways.
 */
export function TaskBoard({
  tasks,
  member = false,
  onOpen,
  onMove,
  onAdd,
}: {
  tasks: TeamTask[];
  /** The member's own board: they move among To do, In progress and Done. */
  member?: boolean;
  onOpen: (id: number) => void;
  onMove: (task: TeamTask, to: TaskStatus) => void;
  /** The manager's: a new task, from the To do column. */
  onAdd?: () => void;
}) {
  const t = useTranslations("team");
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const mayMove = (task: TeamTask, to: TaskStatus) => (member ? memberMayMove(task.status, to) : task.status !== to);
  const label = (s: TaskStatus) => t(`${member ? "memberStatuses" : "statuses"}.${s}`);

  return (
    <div className="@container" data-task-board>
      <div className="grid items-start gap-4 @2xl:grid-cols-2 @4xl:grid-cols-4">
        {TASK_STATUSES.map((status) => {
          const column = tasks.filter((x) => x.status === status);
          const dragged = tasks.find((x) => x.id === dragging);
          const accepts = !!dragged && mayMove(dragged, status);
          const look = COLUMN[status];
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
              onDragLeave={(e) => {
                // Only when leaving the column, not moving between its cards.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === status ? null : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragged && accepts) onMove(dragged, status);
                setDragging(null);
              }}
              className={cn(
                "flex min-h-72 flex-col gap-3 rounded-3xl p-3 transition-[box-shadow,background-color] duration-150",
                look.column,
                dragging !== null && accepts && "ring-2 ring-dashed ring-foreground/15",
                over === status && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <header className="flex items-center gap-2 px-1.5 pt-1">
                <span className={cn("size-2 shrink-0 rounded-full", look.dot)} aria-hidden />
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{label(status)}</h2>
                <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground shadow-xs">{column.length}</span>
                {status === "todo" && onAdd && (
                  <Button variant="ghost" size="icon" className="size-7 rounded-full hover:bg-background/70" onClick={onAdd} aria-label={t("addHere")} title={t("addHere")}>
                    <Plus className="size-4" />
                  </Button>
                )}
              </header>
              {column.length === 0 && (
                <p className={cn("rounded-2xl border-2 border-dashed px-3 py-8 text-center text-xs text-muted-foreground", look.empty)}>{t("empty")}</p>
              )}
              {column.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  member={member}
                  moves={TASK_STATUSES.filter((s) => mayMove(task, s))}
                  label={label}
                  dragging={dragging === task.id}
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
    </div>
  );
}

/** Each column's soft colour, its dot, and its empty space; darker in dark mode. */
const COLUMN: Record<TaskStatus, { column: string; dot: string; empty: string }> = {
  todo: { column: "bg-pink-100 dark:bg-pink-950/50", dot: "bg-pink-500", empty: "border-pink-300/60 dark:border-pink-800/60" },
  in_progress: { column: "bg-orange-100 dark:bg-orange-950/50", dot: "bg-orange-500", empty: "border-orange-300/60 dark:border-orange-800/60" },
  done: { column: "bg-cyan-100 dark:bg-cyan-950/50", dot: "bg-cyan-500", empty: "border-cyan-300/60 dark:border-cyan-800/60" },
  confirmed: { column: "bg-violet-100 dark:bg-violet-950/50", dot: "bg-violet-500", empty: "border-violet-300/60 dark:border-violet-800/60" },
};

/** Initials on a colour of their own, the same for one person every time. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="inline-grid size-7 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold text-white ring-2 ring-card"
      style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
      title={name}
    >
      <span aria-hidden>{initials}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

function TaskCard({
  task,
  member,
  moves,
  label,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  task: TeamTask;
  member: boolean;
  moves: TaskStatus[];
  label: (s: TaskStatus) => string;
  dragging: boolean;
  onOpen: () => void;
  onMove: (to: TaskStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const t = useTranslations("team");
  const format = useFormat();
  const locale = useLocale();
  const requester = useRequesterLabel();
  const late = isOverdue(task, isoDate());
  const finished = task.status === "confirmed";
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
      className={cn(
        "group relative rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900 ring-1 ring-black/5 transition-[transform,box-shadow,opacity] duration-150 dark:ring-white/10",
        moves.length > 0 && "cursor-grab active:cursor-grabbing",
        "hover:-translate-y-0.5 hover:shadow-md focus-within:shadow-md",
        dragging && "rotate-1 opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {task.confidential && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger" title={t("confidentialHint")}>
              <Lock className="size-3" aria-hidden />
              {t("confidential")}
            </span>
          )}
        </div>
        {moves.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                // Above the card's own button, which covers the card.
                className="relative z-10 -me-2 -mt-2 size-8 shrink-0 rounded-full text-muted-foreground opacity-70 group-hover:opacity-100"
                aria-label={t("actions.moveTask", { title: task.title })}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="max-w-64 truncate">{task.title}</DropdownMenuLabel>
              {moves.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => onMove(s)}>
                  {t("actions.move", { status: label(s) })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <h3 className="mt-2.5 text-[0.95rem] font-semibold leading-snug">
        {/* The whole card opens it: the title's button stretches over it. */}
        <button type="button" onClick={onOpen} className="text-start after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {task.title}
        </button>
      </h3>
      {task.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground" dir="auto">{task.description}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{t("from", { name: requester(task) })}</p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("progress")}</span>
          <span className="font-medium tabular-nums">{task.progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={t("progressDone", { value: task.progress })}
          aria-valuenow={task.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full transition-[width] duration-300", finished ? "bg-violet-500" : "bg-teal-600")} style={{ width: `${task.progress}%` }} />
        </div>
      </div>

      <footer className="mt-3.5 flex items-center justify-between gap-2">
        {!member && task.assigneeName ? <Avatar name={task.assigneeName} /> : <span />}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {task.updates > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" title={t("updatesCount", { count: task.updates })}>
              <MessageSquare className="size-3" aria-hidden />
              <span className="tabular-nums">{task.updates}</span>
              <span className="sr-only">{t("updatesCount", { count: task.updates })}</span>
            </span>
          )}
          {task.dueDate && (
            <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5", late && "border-danger/40 bg-danger-soft font-medium text-danger")}>
              <CalendarClock className="size-3" aria-hidden />
              {late ? `${t("overdue")} · ` : ""}
              <span title={format.date(task.dueDate)}>{formatWith(`${task.dueDate}T00:00:00Z`, locale, { day: "numeric", month: "short", timeZone: "UTC" })}</span>
            </span>
          )}
        </div>
      </footer>
    </article>
  );
}
