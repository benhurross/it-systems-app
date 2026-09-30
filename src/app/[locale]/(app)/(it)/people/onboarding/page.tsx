"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { columnHelper, DataTable } from "@/components/data-table";
import { JoinerDialog } from "@/components/people/dialogs";
import { PeopleHeader } from "@/components/people/people-header";
import { TaskProgress } from "@/components/projects/progress-cell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Joiner } from "@/lib/api-types";
import { ONBOARDING_PHASES, ONBOARDING_TASKS } from "@/lib/domain";
import { onboardingComplete, onboardingProgress } from "@/lib/people";

const col = columnHelper<Joiner>();

export default function OnboardingPage() {
  const t = useTranslations("people");
  const format = useFormat();
  const lookups = useLookups();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data = [], isLoading } = useApi<Joiner[]>("/joiners");
  const open = data.find((j) => j.id === openId);

  const columns = [
    col.accessor("name", {
      header: t("name"),
      cell: (info) => (
        <button type="button" onClick={() => setOpenId(info.row.original.id)} className="text-start font-medium hover:text-primary">
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("jobTitle", { header: t("jobTitle") }),
    col.accessor("department", {
      header: t("department"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("department", info.getValue()),
    }),
    col.accessor("startDate", { header: t("onboarding.startDate"), cell: (info) => format.date(info.getValue()) }),
    col.accessor((j) => onboardingProgress(j.tasks).ratio, {
      id: "progress",
      header: t("progress"),
      cell: (info) => {
        const { done, total } = onboardingProgress(info.row.original.tasks);
        return <TaskProgress done={done} total={total} />;
      },
    }),
    col.accessor((j) => (j.completedAt ? "completed" : "in_progress"), {
      id: "status",
      header: t("status"),
      filterFn: "arrHas",
      cell: (info) =>
        info.getValue() === "completed" ? (
          <StatusBadge tone="success">{t("onboarding.completed")}</StatusBadge>
        ) : (
          <StatusBadge tone="info">{t("onboarding.inProgress")}</StatusBadge>
        ),
    }),
  ];

  return (
    <>
      <PeopleHeader
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("onboarding.new")}
          </Button>
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        facets={[
          { column: "department", label: t("department"), options: lookups.options("department") },
          {
            column: "status",
            label: t("status"),
            options: [
              { value: "in_progress", label: t("onboarding.inProgress") },
              { value: "completed", label: t("onboarding.completed") },
            ],
          },
        ]}
      />
      {adding && <JoinerDialog onClose={() => setAdding(false)} />}
      {open && <JoinerSheet key={open.id} joiner={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** The three-phase checklist. Finishing it adds the new starter to the directory. */
function JoinerSheet({ joiner, onClose }: { joiner: Joiner; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormat();
  // Ticks apply at once. Each save carries the whole checklist and saves run in order, so quick
  // clicks never undo each other, and completing waits for the last tick to land.
  const [tasks, setTasks] = useState(joiner.tasks);
  const scope = `joiner-${joiner.id}`;
  const update = useApiMutation(
    (next: Record<string, boolean>) => api(`/joiners/${joiner.id}`, { method: "PATCH", body: { tasks: next } }),
    { scope },
  );
  const complete = useApiMutation(() => api(`/joiners/${joiner.id}/complete`, { method: "POST" }), {
    success: t("people.onboarding.done", { name: joiner.name }),
    scope,
  });
  const progress = onboardingProgress(tasks);
  const finished = joiner.completedAt !== null;

  return (
    <Sheet open onOpenChange={(value) => !value && onClose()}>
      <SheetContent
        side={locale === "ar" ? "left" : "right"}
        className="overflow-y-auto data-[side=left]:sm:max-w-md data-[side=right]:sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{t("people.onboarding.checklist", { name: joiner.name })}</SheetTitle>
          <SheetDescription>
            {joiner.jobTitle} · {t("people.onboarding.starts", { date: format.date(joiner.startDate) })}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4">
          <TaskProgress done={progress.done} total={progress.total} />
          {ONBOARDING_PHASES.map((phase, i) => (
            <fieldset key={phase} className="space-y-2">
              <legend className="mb-2 flex w-full justify-between text-sm font-medium">
                {t(`enums.onboardingPhase.${phase}`)}
                <span className="text-muted-foreground tabular-nums">
                  {format.number(progress.phases[i].done)}/{format.number(progress.phases[i].total)}
                </span>
              </legend>
              {ONBOARDING_TASKS.filter((task) => task.phase === phase).map((task) => (
                <div key={task.key} className="flex items-center gap-3">
                  <Checkbox
                    id={`joiner-${task.key}`}
                    checked={!!tasks[task.key]}
                    disabled={finished}
                    onCheckedChange={(checked) => {
                      const next = { ...tasks, [task.key]: checked === true };
                      setTasks(next);
                      update.mutate(next);
                    }}
                  />
                  <Label htmlFor={`joiner-${task.key}`} className="font-normal">
                    {t(`enums.onboardingTask.${task.key}`)}
                  </Label>
                </div>
              ))}
            </fieldset>
          ))}
        </div>
        <SheetFooter>
          {finished ? (
            joiner.employeeId && (
              <Button variant="outline" asChild>
                <Link href={`/people/directory/${joiner.employeeId}`}>{t("people.onboarding.viewInDirectory")}</Link>
              </Button>
            )
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("people.onboarding.completeHint", { name: joiner.name })}</p>
              <Button
                disabled={!onboardingComplete(tasks) || update.isPending || complete.isPending}
                onClick={() => complete.mutate(undefined)}
              >
                {t("people.onboarding.complete")}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
