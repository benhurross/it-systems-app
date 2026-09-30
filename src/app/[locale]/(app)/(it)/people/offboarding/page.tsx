"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { LeaverDialog } from "@/components/people/dialogs";
import { PeopleHeader } from "@/components/people/people-header";
import { TaskProgress } from "@/components/projects/progress-cell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { Leaver } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { OFFBOARDING_TASKS } from "@/lib/domain";
import { forwardingDaysLeft, forwardingEnds, leaverState, type LeaverState } from "@/lib/people";

type Row = Leaver & { state: LeaverState; daysLeft: number };
const col = columnHelper<Row>();
const STATES: LeaverState[] = ["forwarding", "due", "completed"];
const doneCount = (tasks: Record<string, boolean>) => OFFBOARDING_TASKS.filter((task) => tasks[task]).length;

export default function OffboardingPage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data = [], isLoading } = useApi<Leaver[]>("/leavers");
  const today = isoDate();
  const rows: Row[] = data.map((l) => ({ ...l, state: leaverState(l, today), daysLeft: forwardingDaysLeft(l.resignationDate, today) }));
  const open = rows.find((l) => l.id === openId);

  const columns = [
    col.accessor("name", {
      header: t("people.name"),
      cell: (info) => (
        <button type="button" onClick={() => setOpenId(info.row.original.id)} className="text-start font-medium hover:text-primary">
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("department", {
      header: t("people.department"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("department", info.getValue()),
    }),
    col.accessor("resignationDate", { header: t("people.offboarding.resignationDate"), cell: (info) => format.date(info.getValue()) }),
    col.accessor("daysLeft", {
      header: t("people.offboarding.forwarding"),
      cell: (info) => <Countdown row={info.row.original} />,
    }),
    col.accessor((l) => doneCount(l.tasks), {
      id: "progress",
      header: t("people.progress"),
      cell: (info) => <TaskProgress done={info.getValue()} total={OFFBOARDING_TASKS.length} />,
    }),
    col.accessor("state", {
      header: t("people.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="leaverState" value={info.getValue()} />,
    }),
  ];

  return (
    <>
      <PeopleHeader
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("people.offboarding.new")}
          </Button>
        }
      />
      <DataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        facets={[
          {
            column: "state",
            label: t("people.status"),
            options: STATES.map((s) => ({ value: s, label: t(`enums.leaverState.${s}`) })),
          },
          { column: "department", label: t("people.department"), options: lookups.options("department") },
        ]}
      />
      {adding && <LeaverDialog leavers={data} onClose={() => setAdding(false)} />}
      {open && <LeaverSheet key={open.id} leaver={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** Days of mail forwarding left, or how long ago it ended; nothing once offboarding is complete. */
function Countdown({ row }: { row: Row }) {
  const t = useTranslations("people.offboarding");
  const format = useFormat();
  if (row.state === "completed") return <span className="text-muted-foreground">—</span>;
  return row.daysLeft > 0 ? (
    <span className="whitespace-nowrap">{t("daysLeft", { days: format.number(row.daysLeft) })}</span>
  ) : (
    <span className="whitespace-nowrap font-medium text-danger">{t("overdueBy", { days: format.number(-row.daysLeft) })}</span>
  );
}

/** The leaver's checklist and notes. Ticking the last step completes offboarding. */
function LeaverSheet({ leaver, onClose }: { leaver: Row; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormat();
  const lookups = useLookups();
  const [tasks, setTasks] = useState(leaver.tasks);
  const [notes, setNotes] = useState(leaver.notes ?? "");
  // Each save carries the whole checklist, so saves for one leaver run in order.
  const scope = `leaver-${leaver.id}`;
  const update = useApiMutation(
    (body: { tasks: Record<string, boolean>; notes?: string }) => api(`/leavers/${leaver.id}`, { method: "PATCH", body }),
    { scope },
  );
  const saveNotes = useApiMutation((text: string) => api(`/leavers/${leaver.id}`, { method: "PATCH", body: { tasks, notes: text } }), {
    success: t("people.offboarding.notesSaved"),
    scope,
  });

  return (
    <Sheet open onOpenChange={(value) => !value && onClose()}>
      <SheetContent
        side={locale === "ar" ? "left" : "right"}
        className="overflow-y-auto data-[side=left]:sm:max-w-md data-[side=right]:sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{t("people.offboarding.checklist", { name: leaver.name })}</SheetTitle>
          <SheetDescription>
            {lookups.label("department", leaver.department)} · {t("people.offboarding.resignationDate")}: {format.date(leaver.resignationDate)}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{t("people.offboarding.forwardingEnds", { date: format.date(forwardingEnds(leaver.resignationDate)) })}</span>
              <EnumBadge kind="leaverState" value={leaver.state} />
            </div>
            <Countdown row={leaver} />
            {leaver.forwardTo && (
              <p className="text-muted-foreground">
                {t("people.offboarding.forwardTo")}: <span dir="ltr">{leaver.forwardTo}</span>
              </p>
            )}
          </div>
          <TaskProgress done={doneCount(tasks)} total={OFFBOARDING_TASKS.length} />
          <div className="space-y-2">
            {OFFBOARDING_TASKS.map((task) => (
              <div key={task} className="flex items-center gap-3">
                <Checkbox
                  id={`leaver-${task}`}
                  checked={!!tasks[task]}
                  onCheckedChange={(checked) => {
                    const next = { ...tasks, [task]: checked === true };
                    setTasks(next);
                    update.mutate({ tasks: next });
                  }}
                />
                <Label htmlFor={`leaver-${task}`} className="font-normal">
                  {t(`enums.offboardingTask.${task}`)}
                </Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("people.offboarding.completeHint")}</p>
          <div className="space-y-2">
            <Label htmlFor="leaver-notes">{t("people.offboarding.notes")}</Label>
            <Textarea id="leaver-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => saveNotes.mutate(notes)} disabled={saveNotes.isPending}>
              {t("people.offboarding.saveNotes")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
