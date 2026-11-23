"use client";

import { Hint } from "@/components/hint";
import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { LeaverDialog } from "@/components/people/dialogs";
import { PeopleHeader } from "@/components/people/people-header";
import { TaskProgress } from "@/components/projects/progress-cell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { Leaver } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { OFFBOARDING_TASKS } from "@/lib/domain";
import { can } from "@/lib/permissions";
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
  // Records ticked for deleting. Shift-ticking ticks every row between the last one ticked and this
  // one, as the list shows them (sorted and filtered), so a run of names is chosen in two clicks.
  const [chosen, setChosen] = useState<number[]>([]);
  const lastTicked = useRef<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const chosenRows = rows.filter((r) => chosen.includes(r.id));
  // Only an Admin deletes offboarding records; the server holds to it too.
  const mayDelete = can(useCurrentUser().role, "manager");

  const select = [
    col.display({
      id: "select",
      header: (info) => {
        const page = info.table.getRowModel().rows.map((r) => r.original.id);
        const all = page.length > 0 && page.every((id) => chosen.includes(id));
        return (
          <Checkbox
            checked={all ? true : page.some((id) => chosen.includes(id)) ? "indeterminate" : false}
            onCheckedChange={(on) => setChosen((c) => (on === true ? [...new Set([...c, ...page])] : c.filter((id) => !page.includes(id))))}
            aria-label={t("people.offboarding.selectPage")}
          />
        );
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <Checkbox
            checked={chosen.includes(row.id)}
            aria-label={t("people.offboarding.select", { name: row.name })}
            onClick={(e) => {
              const on = !chosen.includes(row.id);
              const order = info.table.getPrePaginatedRowModel().rows.map((r) => r.original.id);
              const from = lastTicked.current === null ? -1 : order.indexOf(lastTicked.current);
              const to = order.indexOf(row.id);
              const run = e.shiftKey && from >= 0 && to >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [row.id];
              setChosen((c) => (on ? [...new Set([...c, ...run])] : c.filter((id) => !run.includes(id))));
              lastTicked.current = row.id;
              e.preventDefault();
            }}
          />
        );
      },
    }),
  ];
  const columns = [
    ...(mayDelete ? select : []),
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
      {mayDelete && <p className="mb-3 text-sm text-muted-foreground">{t("people.offboarding.selectHint")}</p>}
      <DataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        toolbar={
          mayDelete &&
          chosen.length > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setChosen([])}>
                {t("people.offboarding.clearSelection")}
              </Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleting(true)}>
                <Trash2 />
                {t("people.offboarding.deleteSelected", { count: chosen.length })}
              </Button>
            </>
          )
        }
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
      {deleting && (
        <DeleteLeavers
          rows={chosenRows}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setChosen([]);
            setDeleting(false);
          }}
        />
      )}
      {open && <LeaverSheet key={open.id} leaver={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

/**
 * Asks before deleting the chosen offboarding records, naming each, and waits for a tick. Those
 * whose offboarding was completed were marked as having left: they may be made current again.
 */
function DeleteLeavers({ rows, onClose, onDeleted }: { rows: Row[]; onClose: () => void; onDeleted: () => void }) {
  const t = useTranslations();
  const ids = useId();
  const [sure, setSure] = useState(false);
  const [restore, setRestore] = useState(false);
  const completed = rows.filter((r) => r.completedAt);
  const remove = useApiMutation(
    () => api<{ deleted: number }>("/leavers/delete", { body: { ids: rows.map((r) => r.id), restore: restore && completed.length > 0 } }),
    { onSuccess: (done) => (toast.success(t("people.offboarding.deleted", { count: done.deleted })), onDeleted()) },
  );
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-delete-leavers>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("people.offboarding.deleteTitle", { count: rows.length })}</AlertDialogTitle>
          <AlertDialogDescription>{t("people.offboarding.deleteBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-48 list-inside list-disc overflow-y-auto rounded-lg border p-3 text-sm">
          {rows.map((r) => (
            <li key={r.id}>{r.name}</li>
          ))}
        </ul>
        {completed.length > 0 && (
          <div className="flex items-start gap-2">
            <Checkbox id={`${ids}-restore`} checked={restore} onCheckedChange={(v) => setRestore(v === true)} />
            <Label htmlFor={`${ids}-restore`} className="font-normal leading-snug">
              {t("people.offboarding.restore", { count: completed.length })}
            </Label>
          </div>
        )}
        <div className="flex items-start gap-2 border-t pt-3">
          <Checkbox id={`${ids}-sure`} checked={sure} onCheckedChange={(v) => setSure(v === true)} />
          <Label htmlFor={`${ids}-sure`} className="font-medium leading-snug">
            {t("people.offboarding.deleteConfirm", { count: rows.length })}
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.keep")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!sure || remove.isPending}
            onClick={(e) => {
              // Stays open until it is done, so a failure can be seen.
              e.preventDefault();
              remove.mutate(undefined);
            }}
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <TaskProgress done={doneCount(tasks)} total={OFFBOARDING_TASKS.length} />
            </div>
            <Hint>{t("people.offboarding.completeHint")}</Hint>
          </div>
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
