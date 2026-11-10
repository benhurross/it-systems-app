"use client";

import { Check, CornerUpLeft, Lock, Pencil, Play, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { TeamTask, TeamTaskDetail, TeamTaskEvent } from "@/lib/api-types";
import type { TaskAction, TaskStatus } from "@/lib/team";
import { cn } from "@/lib/utils";
import { ConfidentialMark, DueLabel, PriorityBadge, TaskProgress, TaskStatusBadge, useRequesterLabel } from "./task-bits";
import { TaskDialog } from "./task-dialog";

/**
 * A task opened: what it is, its progress, what can be done to it now, and its timeline. The
 * member starts it, moves its progress, adds updates and marks it done; the manager confirms it,
 * sends it back with a comment, reopens it, edits it and keeps private notes.
 */
export function TaskSheet({ id, manager = false, onClose }: { id: number; manager?: boolean; onClose: () => void }) {
  const t = useTranslations("team");
  const { data: task } = useApi<TeamTaskDetail>(`/team/tasks/${id}`);
  const [editing, setEditing] = useState(false);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg" data-task-sheet>
        {!task ? (
          <div className="space-y-3 p-6">
            <SheetTitle className="sr-only">{t("task")}</SheetTitle>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="pe-8 text-lg">{task.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={task.status} member={!manager} />
                <PriorityBadge priority={task.priority} />
                {task.confidential && <ConfidentialMark />}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 p-4">
              <Facts task={task} manager={manager} />
              {task.description && <p className="whitespace-pre-line text-sm" dir="auto">{task.description}</p>}
              <TaskProgress value={task.progress} done={task.status === "confirmed"} />
              <Actions task={task} manager={manager} onEdit={() => setEditing(true)} />
              <Timeline events={task.events} />
            </div>
          </>
        )}
      </SheetContent>
      {editing && task && <TaskDialog task={task as unknown as TeamTask} onClose={() => setEditing(false)} />}
    </Sheet>
  );
}

function Facts({ task, manager }: { task: TeamTaskDetail; manager: boolean }) {
  const t = useTranslations("team");
  const format = useFormat();
  const requester = useRequesterLabel();
  const rows: [string, React.ReactNode][] = [
    ...(manager ? [[t("assignee"), task.assigneeName ?? "—"] as [string, React.ReactNode]] : []),
    [t("requester"), requester(task)],
    [t("dueDate"), <DueLabel key="due" task={task} />],
    ...(task.projectName ? [[t("project"), task.projectName] as [string, React.ReactNode]] : []),
    [t("createdBy"), `${task.createdByName}, ${format.date(task.createdAt)}`],
    ...(task.confirmedByName && task.confirmedAt ? [[t("statuses.confirmed"), `${task.confirmedByName}, ${format.date(task.confirmedAt)}`] as [string, React.ReactNode]] : []),
  ];
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What can be done to the task now, by this person. */
function Actions({ task, manager, onEdit }: { task: TeamTaskDetail; manager: boolean; onEdit: () => void }) {
  const t = useTranslations("team");
  const ids = useId();
  const [progress, setProgress] = useState(task.progress);
  const [text, setText] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [asking, setAsking] = useState<"done" | "return" | null>(null);
  const act = useApiMutation((action: TaskAction) => api<TeamTaskDetail>(`/team/tasks/${task.id}/actions`, { body: action }), {
    onSuccess: () => {
      setText("");
      setAsking(null);
    },
  });
  const status: TaskStatus = task.status;
  const open = status === "todo" || status === "in_progress";
  const busy = act.isPending;

  return (
    <div className="space-y-4">
      {/* While asking for a comment (done, or sent back), only that form's buttons show. */}
      <div className={cn("flex flex-wrap gap-2", asking && "hidden")}>
        {status === "todo" && (
          <Button size="sm" onClick={() => act.mutate({ action: "start" })} disabled={busy}>
            <Play />
            {t("actions.start")}
          </Button>
        )}
        {open && (
          <Button size="sm" variant={status === "todo" ? "outline" : "default"} onClick={() => setAsking("done")} disabled={busy}>
            <Check />
            {t("actions.done")}
          </Button>
        )}
        {manager && status === "done" && (
          <>
            <Button size="sm" onClick={() => act.mutate({ action: "confirm", text: null })} disabled={busy}>
              <Check />
              {t("actions.confirm")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAsking("return")} disabled={busy}>
              <CornerUpLeft />
              {t("actions.return")}
            </Button>
          </>
        )}
        {manager && status === "confirmed" && (
          <Button size="sm" variant="outline" onClick={() => act.mutate({ action: "reopen" })} disabled={busy}>
            <RotateCcw />
            {t("actions.reopen")}
          </Button>
        )}
        {manager && (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil />
            {t("editTask")}
          </Button>
        )}
      </div>

      {asking && (
        <form
          className="space-y-2 rounded-lg border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (asking === "done") act.mutate({ action: "done", text: text.trim() || null });
            else if (text.trim()) act.mutate({ action: "return", text: text.trim() });
          }}
        >
          <Label htmlFor={`${ids}-ask`}>{asking === "done" ? t("doneHint") : t("returnHint")}</Label>
          <Textarea id={`${ids}-ask`} value={text} onChange={(e) => setText(e.target.value)} rows={3} required={asking === "return"} dir="auto" />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(null)}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy || (asking === "return" && !text.trim())}>
              {asking === "done" ? t("actions.done") : t("actions.return")}
            </Button>
          </div>
        </form>
      )}

      {open && !asking && (
        <div className="space-y-2">
          <Label htmlFor={`${ids}-progress`}>{t("progress")}</Label>
          <div className="flex items-center gap-3">
            <input
              id={`${ids}-progress`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="w-10 text-end text-sm tabular-nums">{progress}%</span>
            <Button size="sm" variant="outline" onClick={() => act.mutate({ action: "progress", progress, text: null })} disabled={busy || progress === task.progress}>
              {t("actions.saveProgress")}
            </Button>
          </div>
        </div>
      )}

      {!asking && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) act.mutate({ action: isPrivate ? "note" : "comment", text: text.trim() });
          }}
        >
          <Label htmlFor={`${ids}-comment`}>{isPrivate ? t("actions.note") : t("actions.comment")}</Label>
          <Textarea id={`${ids}-comment`} value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={t("commentPlaceholder")} dir="auto" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {manager ? (
              <span className="flex items-center gap-2">
                <Switch id={`${ids}-private`} checked={isPrivate} onCheckedChange={setPrivate} />
                <Label htmlFor={`${ids}-private`} className="text-xs font-normal">
                  {t("noteHint")}
                </Label>
              </span>
            ) : (
              <span />
            )}
            <Button type="submit" size="sm" disabled={busy || !text.trim()}>
              {isPrivate ? t("actions.note") : t("actions.comment")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Timeline({ events }: { events: TeamTaskEvent[] }) {
  const t = useTranslations("team");
  const ts = useTranslations("team.statuses");
  const format = useFormat();
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t("timeline")}</h3>
      <ol className="space-y-2 border-s ps-4">
        {events.toReversed().map((e) => {
          const to = e.detail?.split(">")[1] as TaskStatus | undefined;
          return (
            <li key={e.id} className={cn("relative text-sm", e.kind === "note" && "rounded-md bg-warning-soft/60 p-2")}>
              <span className={cn("absolute -start-[1.3rem] top-1.5 size-2 rounded-full", DOT[e.kind] ?? "bg-muted-foreground")} aria-hidden />
              <p>
                {t(`events.${e.kind}`, { name: e.userName, progress: e.progress ?? 0, status: to ? ts(to) : "" })}
                {e.kind === "note" && (
                  <span className="ms-2 inline-flex items-center gap-1 text-xs font-medium text-warning">
                    <Lock className="size-3" aria-hidden />
                    {t("private")}
                  </span>
                )}
              </p>
              {e.text && <p className="mt-0.5 whitespace-pre-line text-muted-foreground" dir="auto">{e.text}</p>}
              <p className="text-xs text-muted-foreground">{format.dateTime(e.at)}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const DOT: Partial<Record<TeamTaskEvent["kind"], string>> = {
  done: "bg-warning",
  confirmed: "bg-success",
  returned: "bg-danger",
  started: "bg-primary",
  note: "bg-warning",
};
