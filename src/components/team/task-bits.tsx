"use client";

import { CalendarClock, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge, type Tone } from "@/components/status-badge";
import { useFormat } from "@/hooks/use-format";
import { isoDate } from "@/lib/dates";
import { isOverdue, type TaskPriority, type TaskStatus } from "@/lib/team";
import { cn } from "@/lib/utils";

export const PRIORITY_TONE: Record<TaskPriority, Tone> = { low: "neutral", medium: "info", high: "warning", urgent: "danger" };
export const STATUS_TONE: Record<TaskStatus, Tone> = { todo: "neutral", in_progress: "info", done: "warning", confirmed: "success" };

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const t = useTranslations("team.priorities");
  return <StatusBadge tone={PRIORITY_TONE[priority]}>{t(priority)}</StatusBadge>;
}

/** A task's status, worded for the manager (Done, to review) or the member (Done). */
export function TaskStatusBadge({ status, member = false }: { status: TaskStatus; member?: boolean }) {
  const t = useTranslations("team");
  return <StatusBadge tone={STATUS_TONE[status]}>{t(`${member ? "memberStatuses" : "statuses"}.${status}`)}</StatusBadge>;
}

/** A progress bar with its percentage; green once done. */
export function TaskProgress({ value, done = false, className }: { value: number; done?: boolean; className?: string }) {
  const t = useTranslations("team");
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div role="progressbar" aria-label={t("progressDone", { value })} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width]", done ? "bg-success" : "bg-primary")} style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-end text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}

/** Its due date, red when overdue. */
export function DueLabel({ task }: { task: { status: TaskStatus; dueDate: string | null } }) {
  const t = useTranslations("team");
  const format = useFormat();
  if (!task.dueDate) return <span className="text-xs text-muted-foreground">{t("noDue")}</span>;
  const late = isOverdue(task, isoDate());
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", late ? "font-medium text-danger" : "text-muted-foreground")}>
      <CalendarClock className="size-3.5" aria-hidden />
      {late ? `${t("overdue")} · ${format.date(task.dueDate)}` : t("dueOn", { date: format.date(task.dueDate) })}
    </span>
  );
}

export function ConfidentialMark() {
  const t = useTranslations("team");
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-danger" title={t("confidentialHint")}>
      <Lock className="size-3.5" aria-hidden />
      {t("confidential")}
    </span>
  );
}

/** "IT Manager", "GM", "Executive: CFO", "Other: Ahmed". */
export function useRequesterLabel() {
  const t = useTranslations("team.requesters");
  return (task: { requester: string; requesterName: string | null }) =>
    [t(task.requester as "gm"), task.requesterName].filter(Boolean).join(": ");
}
