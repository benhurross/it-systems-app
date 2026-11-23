"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactNode } from "react";
import type { columnHelper } from "@/components/data-table";
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

type Named = { id: number; name: string };

/**
 * Rows ticked on a people list (onboarding, offboarding), for deleting together. Shift-ticking ticks
 * every row between the last one ticked and this one, as the list shows them (sorted and filtered),
 * so a run of names is chosen in two clicks.
 */
export function useChosen() {
  const [chosen, setChosen] = useState<number[]>([]);
  const last = useRef<number | null>(null);
  return { chosen, setChosen, last, clear: () => setChosen([]) };
}

/** The tick-box column for a list whose rows `chosen` keeps. */
export function selectColumn<T extends Named>(col: ReturnType<typeof columnHelper<T>>, state: ReturnType<typeof useChosen>, label: { row: (name: string) => string; page: string }) {
  const { chosen, setChosen, last } = state;
  return col.display({
    id: "select",
    header: (info) => {
      const page = info.table.getRowModel().rows.map((r) => r.original.id);
      const all = page.length > 0 && page.every((id) => chosen.includes(id));
      return (
        <Checkbox
          checked={all ? true : page.some((id) => chosen.includes(id)) ? "indeterminate" : false}
          onCheckedChange={(on) => setChosen((c) => (on === true ? [...new Set([...c, ...page])] : c.filter((id) => !page.includes(id))))}
          aria-label={label.page}
        />
      );
    },
    cell: (info) => {
      const row = info.row.original;
      return (
        <Checkbox
          checked={chosen.includes(row.id)}
          aria-label={label.row(row.name)}
          onClick={(e) => {
            const on = !chosen.includes(row.id);
            const order = info.table.getPrePaginatedRowModel().rows.map((r) => r.original.id);
            const from = last.current === null ? -1 : order.indexOf(last.current);
            const to = order.indexOf(row.id);
            const run = e.shiftKey && from >= 0 && to >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [row.id];
            setChosen((c) => (on ? [...new Set([...c, ...run])] : c.filter((id) => !run.includes(id))));
            last.current = row.id;
            e.preventDefault();
          }}
        />
      );
    },
  });
}

/** Above the list: what is chosen, and the way to delete it. */
export function ChosenActions({ count, onClear, onDelete }: { count: number; onClear: () => void; onDelete: () => void }) {
  const t = useTranslations("people.bulk");
  if (count === 0) return null;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onClear}>
        {t("clearSelection")}
      </Button>
      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
        <Trash2 />
        {t("deleteSelected", { count })}
      </Button>
    </>
  );
}

/** Asks before deleting the chosen rows, naming each, and waits for a tick. `extra` goes above the tick. */
export function ConfirmDelete({
  title,
  body,
  names,
  extra,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  names: string[];
  extra?: ReactNode;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const id = useId();
  const [sure, setSure] = useState(false);
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-delete-chosen>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-48 list-inside list-disc overflow-y-auto rounded-lg border p-3 text-sm">
          {names.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ul>
        {extra}
        <div className="flex items-start gap-2 border-t pt-3">
          <Checkbox id={id} checked={sure} onCheckedChange={(v) => setSure(v === true)} />
          <Label htmlFor={id} className="font-medium leading-snug">
            {t("people.bulk.deleteConfirm", { count: names.length })}
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.keep")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!sure || pending}
            onClick={(e) => {
              // Stays open until it is done, so a failure can be seen.
              e.preventDefault();
              onConfirm();
            }}
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
