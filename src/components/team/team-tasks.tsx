"use client";

import { Kanban, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { columnHelper, DataTable } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { TeamTask } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { isOverdue, REQUESTERS, TASK_PRIORITIES, type TaskStatus } from "@/lib/team";
import { ConfidentialMark, DueLabel, PriorityBadge, TaskProgress, TaskStatusBadge, useRequesterLabel } from "./task-bits";
import { TaskBoard } from "./task-board";

const ALL = "all";
const col = columnHelper<TeamTask>();

/** Moves a task on the board: the server says whether this person may. */
export function useMoveTask() {
  return useApiMutation(({ task, to }: { task: TeamTask; to: TaskStatus }) => api(`/team/tasks/${task.id}/actions`, { body: { action: "move", status: to } }));
}

/** The manager's view of every task: filtered, on the board or as a list. */
export function TeamTasks({ tasks, loading, onOpen }: { tasks: TeamTask[]; loading: boolean; onOpen: (id: number) => void }) {
  const t = useTranslations("team");
  const ids = useId();
  const format = useFormat();
  const requester = useRequesterLabel();
  const move = useMoveTask();
  const [view, setView] = useState<"board" | "list">("board");
  const [member, setMember] = useState(ALL);
  const [asked, setAsked] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [confidential, setConfidential] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [query, setQuery] = useState("");
  const members = useMemo(() => [...new Map(tasks.filter((x) => x.assigneeId).map((x) => [x.assigneeId!, x.assigneeName ?? ""])).entries()].toSorted((a, b) => a[1].localeCompare(b[1])), [tasks]);
  const today = isoDate();
  const shown = tasks.filter(
    (x) =>
      (member === ALL || x.assigneeId === member) &&
      (asked === ALL || x.requester === asked) &&
      (priority === ALL || x.priority === priority) &&
      (!confidential || x.confidential) &&
      (!overdue || isOverdue(x, today)) &&
      (!query.trim() || `${x.title} ${x.description ?? ""} ${x.requesterName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const filter = (id: string, label: string, value: string, set: (v: string) => void, all: string, options: [string, string][]) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${ids}-${id}`}>{label}</Label>
      <Select value={value} onValueChange={set}>
        <SelectTrigger id={`${ids}-${id}`} className="w-44 max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{all}</SelectItem>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const columns = [
    col.accessor("title", {
      header: t("taskTitle"),
      cell: (info) => (
        <button type="button" onClick={() => onOpen(info.row.original.id)} className="text-start font-medium hover:text-primary">
          {info.getValue()}
          {info.row.original.confidential && (
            <span className="ms-2">
              <ConfidentialMark />
            </span>
          )}
        </button>
      ),
    }),
    col.accessor("assigneeName", { header: t("assignee"), cell: (info) => info.getValue() ?? "—" }),
    col.accessor((x) => requester(x), { id: "requester", header: t("requester") }),
    col.accessor("priority", { header: t("priority"), cell: (info) => <PriorityBadge priority={info.getValue()} /> }),
    col.accessor("status", { header: t("status"), cell: (info) => <TaskStatusBadge status={info.getValue()} /> }),
    col.accessor("dueDate", { header: t("dueDate"), cell: (info) => <DueLabel task={info.row.original} /> }),
    col.accessor("progress", { header: t("progress"), cell: (info) => <TaskProgress value={info.getValue()} done={info.row.original.status === "confirmed"} className="w-32" /> }),
    col.accessor("updatedAt", { header: t("lastUpdate"), cell: (info) => <span className="whitespace-nowrap text-xs text-muted-foreground">{format.dateTime(info.getValue())}</span> }),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {filter("member", t("filters.member"), member, setMember, t("filters.allMembers"), members)}
        {filter("requester", t("filters.requester"), asked, setAsked, t("filters.anyone"), REQUESTERS.map((r) => [r, t(`requesters.${r}`)]))}
        {filter("priority", t("filters.priority"), priority, setPriority, t("filters.anyPriority"), TASK_PRIORITIES.map((p) => [p, t(`priorities.${p}`)]))}
        <div className="grid min-w-0 basis-56 gap-1.5">
          <Label htmlFor={`${ids}-q`}>{t("filters.searchLabel")}</Label>
          <Input id={`${ids}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("filters.search")} />
        </div>
        <div className="flex h-9 items-center gap-2">
          <Switch id={`${ids}-conf`} checked={confidential} onCheckedChange={setConfidential} />
          <Label htmlFor={`${ids}-conf`}>{t("filters.confidentialOnly")}</Label>
        </div>
        <div className="flex h-9 items-center gap-2">
          <Switch id={`${ids}-late`} checked={overdue} onCheckedChange={setOverdue} />
          <Label htmlFor={`${ids}-late`}>{t("filters.overdueOnly")}</Label>
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as "board" | "list")} aria-label={t("view")} className="ms-auto">
          <ToggleGroupItem value="board">
            <Kanban />
            {t("board")}
          </ToggleGroupItem>
          <ToggleGroupItem value="list">
            <List />
            {t("list")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === "board" ? (
        <TaskBoard tasks={shown} onOpen={onOpen} onMove={(task, to) => move.mutate({ task, to })} />
      ) : (
        <DataTable data={shown} columns={columns} loading={loading} initialSort={{ id: "dueDate", desc: false }} />
      )}
    </div>
  );
}
