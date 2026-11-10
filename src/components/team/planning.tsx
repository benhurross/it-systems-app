"use client";

import { ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { StatusBadge, type Tone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import type { TeamAssignee, TeamPlan, TeamTask } from "@/lib/api-types";
import { addDays, isoDate } from "@/lib/dates";
import { formatWith } from "@/lib/format";
import { AWAY_KINDS, type PlanKind } from "@/lib/team";
import { cn } from "@/lib/utils";
import { PlanDialog } from "./plan-dialog";

export const PLAN_TONE: Record<PlanKind, Tone> = {
  work: "info",
  exam: "brand",
  training: "success",
  leave: "warning",
  out_of_office: "danger",
  other: "neutral",
};
const dayOfWeek = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** The Sunday a week starts on, as the working week does here. */
export const weekStart = (iso: string) => addDays(iso, -dayOfWeek(iso));
/** Friday and Saturday: the weekend. */
const weekend = (iso: string) => dayOfWeek(iso) === 5 || dayOfWeek(iso) === 6;
const covers = (p: { startDate: string; endDate: string }, day: string) =>
  p.startDate <= day && p.endDate >= day;

/** A plan entry as a small coloured label: its kind, and its title when there is room. */
function Entry({
  plan,
  compact = false,
  onClick,
}: {
  plan: TeamPlan;
  compact?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("team.plans");
  const label = compact
    ? `${plan.userName.split(" ")[0]}: ${t(`kinds.${plan.kind}`)}`
    : plan.title;
  const body = (
    <StatusBadge
      tone={PLAN_TONE[plan.kind]}
      className={cn(
        "max-w-full justify-start truncate",
        AWAY_KINDS.includes(plan.kind) && "font-semibold",
      )}
    >
      <span
        className="truncate"
        title={`${t(`kinds.${plan.kind}`)}: ${plan.title}${plan.note ? ` (${plan.note})` : ""}`}
      >
        {label}
      </span>
    </StatusBadge>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="max-w-full text-start">
      {body}
    </button>
  ) : (
    body
  );
}

/** The member's own plan for this week and the four after it, to add to and change. */
export function MyPlan() {
  const t = useTranslations("team.plans");
  const format = useFormat();
  const start = weekStart(isoDate());
  const end = addDays(start, 34);
  const { data: plans, isLoading } = useApi<TeamPlan[]>(
    `/team/plans?from=${start}&to=${end}`,
  );
  const [editing, setEditing] = useState<TeamPlan | "new" | null>(null);
  const thisWeekEnd = addDays(start, 6);
  const groups: [string, TeamPlan[]][] = [
    [t("thisWeek"), (plans ?? []).filter((p) => p.startDate <= thisWeekEnd)],
    [t("nextWeeks"), (plans ?? []).filter((p) => p.startDate > thisWeekEnd)],
  ];
  return (
    <Card data-my-plan>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>{t("my")}</CardTitle>
          <CardDescription>{t("myHint")}</CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus />
          {t("add")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !plans ? (
          <Skeleton className="h-20 w-full" />
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          groups.map(([title, list]) =>
            list.length ? (
              <section key={title} className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {title}
                </h3>
                <ul className="divide-y rounded-lg border">
                  {list.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-3 p-2.5 text-sm"
                    >
                      <StatusBadge tone={PLAN_TONE[p.kind]}>
                        {t(`kinds.${p.kind}`)}
                      </StatusBadge>
                      <span className="min-w-0 flex-1 font-medium" dir="auto">
                        {p.title}
                        {p.note && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {p.note}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.startDate === p.endDate
                          ? format.date(p.startDate)
                          : `${format.date(p.startDate)} – ${format.date(p.endDate)}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setEditing(p)}
                        aria-label={`${t("edit")}: ${p.title}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )
        )}
      </CardContent>
      {editing && (
        <PlanDialog
          plan={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

/**
 * The team's plans, for the manager: a week, with a row for each member and a column for each day,
 * or a month as a calendar. Exams, training and leave stand out, with the tasks due each day.
 */
export function TeamPlanning({ tasks }: { tasks: TeamTask[] }) {
  const t = useTranslations("team.plans");
  const format = useFormat();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => isoDate());
  const today = isoDate();
  const { data: people = [] } = useApi<TeamAssignee[]>("/team/assignees");

  const monthFirst = `${anchor.slice(0, 7)}-01`;
  const nextMonth = (() => {
    const [y, m] = monthFirst.split("-").map(Number);
    return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  })();
  const from = view === "week" ? weekStart(anchor) : weekStart(monthFirst);
  const to =
    view === "week"
      ? addDays(from, 6)
      : addDays(weekStart(addDays(nextMonth, -1)), 6);
  const { data: plans = [], isLoading } = useApi<TeamPlan[]>(
    `/team/plans?from=${from}&to=${to}`,
  );
  const days = Array.from(
    {
      length:
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
          86_400_000 +
        1,
    },
    (_, i) => addDays(from, i),
  );
  const step = (dir: 1 | -1) =>
    setAnchor(
      view === "week"
        ? addDays(anchor, 7 * dir)
        : dir === 1
          ? nextMonth
          : addDays(monthFirst, -1),
    );
  const dueOn = (day: string, userId?: string) =>
    tasks.filter(
      (x) =>
        x.dueDate === day &&
        x.status !== "confirmed" &&
        (!userId || x.assigneeId === userId),
    );
  const locale = useLocale();
  const at = (iso: string) => `${iso}T00:00:00Z`;
  const weekday = (iso: string) =>
    formatWith(at(iso), locale, { weekday: "short", timeZone: "UTC" });

  return (
    <div className="space-y-4" data-team-planning>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(v) => v && setView(v as "week" | "month")}
        >
          <ToggleGroupItem value="week">{t("week")}</ToggleGroupItem>
          <ToggleGroupItem value="month">{t("month")}</ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => step(-1)}
          aria-label={t("previous")}
        >
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
          {t("today")}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => step(1)}
          aria-label={t("next")}
        >
          <ChevronRight className="rtl:rotate-180" />
        </Button>
        <h2 className="text-base font-semibold" aria-live="polite">
          {view === "week"
            ? t("weekOf", { from: format.date(from), to: format.date(to) })
            : formatWith(at(monthFirst), locale, {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
        </h2>
        <ul className="ms-auto flex flex-wrap gap-1.5" aria-label={t("legend")}>
          {(
            ["work", "exam", "training", "leave", "out_of_office"] as const
          ).map((k) => (
            <li key={k}>
              <StatusBadge tone={PLAN_TONE[k]}>{t(`kinds.${k}`)}</StatusBadge>
            </li>
          ))}
        </ul>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : view === "week" ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="w-44 p-2 text-start font-medium">
                  {t("member")}
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className={cn(
                      "p-2 text-start font-medium",
                      weekend(d) && "bg-muted",
                      d === today && "text-primary",
                    )}
                  >
                    {weekday(d)}{" "}
                    <span className="font-normal text-muted-foreground">
                      {formatWith(at(d), locale, {
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people
                // An Admin (the manager) has a row only with plans or tasks that week.
                .filter(
                  (person) =>
                    person.role !== "admin" ||
                    plans.some((p) => p.userId === person.id) ||
                    days.some((d) => dueOn(d, person.id).length > 0),
                )
                .map((person) => (
                  <tr key={person.id} className="border-t align-top">
                    <th scope="row" className="p-2 text-start font-medium">
                      {person.name}
                    </th>
                    {days.map((d) => {
                      const entries = plans.filter(
                        (p) => p.userId === person.id && covers(p, d),
                      );
                      const due = dueOn(d, person.id);
                      return (
                        <td
                          key={d}
                          className={cn(
                            "space-y-1 border-s p-1.5",
                            weekend(d) && "bg-muted/60",
                            entries.some((e) => AWAY_KINDS.includes(e.kind)) &&
                              "bg-warning-soft/40",
                          )}
                        >
                          {entries.map((e) => (
                            <Entry key={e.id} plan={e} />
                          ))}
                          {due.map((x) => (
                            <p
                              key={x.id}
                              className="truncate text-xs text-muted-foreground"
                              title={x.title}
                            >
                              {t("due", { title: x.title })}
                            </p>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <div className="grid min-w-[48rem] grid-cols-7">
            {days.slice(0, 7).map((d) => (
              <div
                key={`h-${d}`}
                className="border-b bg-muted/50 p-2 text-sm font-medium"
              >
                {weekday(d)}
              </div>
            ))}
            {days.map((d) => {
              const entries = plans.filter((p) => covers(p, d));
              const outside = d < monthFirst || d >= nextMonth;
              return (
                <div
                  key={d}
                  className={cn(
                    "min-h-24 space-y-1 border-b border-s p-1.5",
                    weekend(d) && "bg-muted/60",
                    outside && "opacity-40",
                  )}
                >
                  <p
                    className={cn(
                      "text-xs font-medium",
                      d === today && "text-primary",
                    )}
                  >
                    {Number(d.slice(8))}
                  </p>
                  {entries.slice(0, 3).map((e) => (
                    <Entry key={e.id} plan={e} compact />
                  ))}
                  {entries.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{entries.length - 3}
                    </p>
                  )}
                  {dueOn(d).length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("due", { title: String(dueOn(d).length) })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!isLoading && plans.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("nothing")}</p>
      )}
    </div>
  );
}
