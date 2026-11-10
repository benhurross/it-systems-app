"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Eye, Loader, Lock, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import type { TeamDashboard as Dashboard } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { PLAN_TONE } from "./planning";
import { ConfidentialMark, DueLabel, PriorityBadge, TaskProgress } from "./task-bits";

/**
 * The manager's view of the team at a glance: the figures, each member's workload (tasks given,
 * tickets, project tasks, and who is away this week), what waits for review, what is due, and
 * what happened lately.
 */
export function TeamDashboard({ onOpen }: { onOpen: (id: number) => void }) {
  const t = useTranslations("team.dashboard");
  const { data } = useApi<Dashboard>("/team/dashboard");
  if (!data) return <Skeleton className="h-96 w-full" />;
  const f = data.figures;
  const tiles: [keyof typeof f, LucideIcon, string][] = [
    ["open", ClipboardList, "text-primary"],
    ["inProgress", Loader, "text-info"],
    ["toReview", Eye, "text-warning"],
    ["overdue", AlertTriangle, "text-danger"],
    ["dueThisWeek", CalendarClock, "text-brand"],
    ["confidential", Lock, "text-danger"],
    ["confirmedThisMonth", CheckCircle2, "text-success"],
  ];
  return (
    <div className="space-y-4" data-team-dashboard>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {tiles.map(([key, Icon, tone]) => (
          <Card key={key} className="gap-1 py-3">
            <CardContent className="flex items-center gap-3 px-3">
              <Icon className={cn("size-6 shrink-0", tone)} aria-hidden />
              <div>
                <p className="text-xs text-muted-foreground">{t(key)}</p>
                <p className={cn("text-2xl font-semibold tabular-nums", key === "overdue" && f.overdue > 0 && "text-danger")}>{f[key]}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Workload members={data.members} />
        <div className="space-y-4">
          <TaskList title={t("reviewQueue")} empty={t("nothingToReview")} tasks={data.toReview} onOpen={onOpen} />
          <TaskList title={t("upcoming")} empty={t("nothingDue")} tasks={data.upcoming} onOpen={onOpen} />
          <Activity items={data.activity} onOpen={onOpen} />
        </div>
      </div>
    </div>
  );
}

function Workload({ members }: { members: Dashboard["members"] }) {
  const t = useTranslations("team.dashboard");
  const tp = useTranslations("team.plans");
  const format = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("workload")}</CardTitle>
      </CardHeader>
      {/* Scrolls sideways on a narrow screen: reachable from the keyboard to do so. */}
      <CardContent className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("workload")}>
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b text-start text-xs text-muted-foreground">
              <th scope="col" className="p-2 text-start font-medium">{t("member")}</th>
              <th scope="col" className="p-2 text-start font-medium">{t("tasks")}</th>
              <th scope="col" className="p-2 text-start font-medium">{t("tickets")}</th>
              <th scope="col" className="p-2 text-start font-medium">{t("projectTasks")}</th>
              <th scope="col" className="w-40 p-2 text-start font-medium">{t("progress")}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b align-top last:border-0" data-member={m.name}>
                <th scope="row" className="p-2 text-start font-medium">
                  {m.name}
                  {m.away.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1" aria-label={t("away")}>
                      {m.away.map((a, i) => (
                        <StatusBadge key={i} tone={PLAN_TONE[a.kind]} className="font-normal">
                          {tp(`kinds.${a.kind}`)} · {a.startDate === a.endDate ? format.date(a.startDate) : `${format.date(a.startDate)} – ${format.date(a.endDate)}`}
                        </StatusBadge>
                      ))}
                    </span>
                  )}
                </th>
                <td className="p-2">
                  <p>{t("taskCounts", { todo: m.todo, inProgress: m.inProgress, toReview: m.toReview })}</p>
                  {m.overdue > 0 && <p className="text-xs font-medium text-danger">{t("overdueCount", { count: m.overdue })}</p>}
                </td>
                <td className="p-2">
                  <p className="tabular-nums">{m.tickets}</p>
                  {m.ticketsOverdue > 0 && <p className="text-xs font-medium text-danger">{t("ticketsOverdue", { count: m.ticketsOverdue })}</p>}
                </td>
                <td className="p-2 tabular-nums">{m.projectTasks}</td>
                <td className="p-2">
                  <TaskProgress value={m.progress} done={m.progress === 100} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TaskList({ title, empty, tasks, onOpen }: { title: string; empty: string; tasks: Dashboard["toReview"]; onOpen: (id: number) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((x) => (
              <li key={x.id} className="space-y-1 text-sm">
                <button type="button" onClick={() => onOpen(x.id)} className="text-start font-medium hover:text-primary">
                  {x.title}
                </button>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {x.assigneeName}
                  <PriorityBadge priority={x.priority} />
                  <DueLabel task={x} />
                  {x.confidential && <ConfidentialMark />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Activity({ items, onOpen }: { items: Dashboard["activity"]; onOpen: (id: number) => void }) {
  const t = useTranslations("team");
  const format = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboard.activity")}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.noActivity")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((a) => (
              <li key={a.id}>
                <p>
                  {t(`events.${a.kind}`, { name: a.userName, progress: a.progress ?? 0, status: "" })}:{" "}
                  <button type="button" onClick={() => onOpen(a.taskId)} className="font-medium hover:text-primary">
                    {a.title}
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">{format.relative(a.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
