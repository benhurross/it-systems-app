"use client";

import { Hint } from "@/components/hint";
import { IdCard, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { columnHelper, DataTable } from "@/components/data-table";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { ChosenActions, ConfirmDelete, selectColumn, useChosen } from "@/components/people/bulk-select";
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
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Joiner } from "@/lib/api-types";
import { ONBOARDING_PHASES, ONBOARDING_TASKS } from "@/lib/domain";
import { onboardingComplete, onboardingProgress } from "@/lib/people";
import { can } from "@/lib/permissions";

const col = columnHelper<Joiner>();

export default function OnboardingPage() {
  const t = useTranslations("people");
  const format = useFormat();
  const lookups = useLookups();
  const [adding, setAdding] = useState(false);
  // Opened from elsewhere (the directory's warning about someone being onboarded) with ?open=<id>.
  const asked = Number(useSearchParams().get("open"));
  const [openId, setOpenId] = useState<number | null>(Number.isInteger(asked) && asked > 0 ? asked : null);
  const { data = [], isLoading } = useApi<Joiner[]>("/joiners");
  const open = data.find((j) => j.id === openId);
  // Records ticked for deleting: Admins only, and the server holds to it too.
  const mayDelete = can(useCurrentUser().role, "manager");
  const chosenState = useChosen();
  const { chosen } = chosenState;
  const [deleting, setDeleting] = useState(false);

  const columns = [
    ...(mayDelete ? [selectColumn(col, chosenState, { row: (name) => t("bulk.select", { name }), page: t("bulk.selectPage") })] : []),
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
      {mayDelete && <p className="mb-3 text-sm text-muted-foreground">{t("bulk.selectHint")}</p>}
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        toolbar={mayDelete && <ChosenActions count={chosen.length} onClear={chosenState.clear} onDelete={() => setDeleting(true)} />}
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
      {deleting && (
        <DeleteJoiners
          rows={data.filter((j) => chosen.includes(j.id))}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            chosenState.clear();
            setDeleting(false);
            setOpenId(null);
          }}
        />
      )}
      {open && <JoinerSheet key={open.id} joiner={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** Deletes the chosen onboarding records once asked; those already in the directory stay there. */
function DeleteJoiners({ rows, onClose, onDeleted }: { rows: Joiner[]; onClose: () => void; onDeleted: () => void }) {
  const t = useTranslations("people.onboarding");
  const remove = useApiMutation(() => api<{ deleted: number }>("/joiners/delete", { body: { ids: rows.map((r) => r.id) } }), {
    onSuccess: (done) => (toast.success(t("deleted", { count: done.deleted })), onDeleted()),
  });
  return (
    <ConfirmDelete
      title={t("deleteTitle", { count: rows.length })}
      body={t("deleteBody")}
      names={rows.map((r) => r.name)}
      pending={remove.isPending}
      onConfirm={() => remove.mutate(undefined)}
      onClose={onClose}
    />
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
  const complete = useApiMutation(() => api<{ linked: boolean }>(`/joiners/${joiner.id}/complete`, { method: "POST" }), {
    // Linked to an entry someone had already added by hand, or a new one.
    onSuccess: (done) => toast.success(t(done.linked ? "people.onboarding.doneLinked" : "people.onboarding.done", { name: joiner.name })),
    scope,
  });
  const router = useRouter();
  // The card is started (or the one already started is found) and opened to add the photo and print.
  const card = useApiMutation(
    () => api<{ id: number }>("/id-cards", { body: { employeeId: null, joinerId: joiner.id, reason: "new_joiner" } }),
    { onSuccess: (row) => router.push(`/people/id-cards/${row.id}`) },
  );
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
                  {task.key === "print_id_card" && !finished && (
                    <Button variant="outline" size="xs" className="ms-auto" disabled={card.isPending} onClick={() => card.mutate(undefined)}>
                      <IdCard />
                      {t("idCards.openForJoiner")}
                    </Button>
                  )}
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
              <Hint>{t("people.onboarding.completeHint", { name: joiner.name })}</Hint>
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
