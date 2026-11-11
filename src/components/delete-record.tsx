"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";

/**
 * Delete, asked first: removes the record at `path` (as /projects/3) for good, then `onDeleted`
 * (to leave its page, say). `detail` says what else goes with it. With `impact` (as "asset/12"),
 * the database is asked what the record is linked to, and that is listed: what goes with it, and
 * what only loses its link. Anything listed, Delete waits for a tick: "Yes, delete it".
 */
export function DeleteRecord({
  path,
  name,
  detail,
  onDeleted,
  labels,
  open,
  onOpenChange,
  impact,
}: {
  path: string;
  /** What the record is, for the database to count what is linked to it: "asset/12". */
  impact?: string;
  name: string;
  detail?: string;
  onDeleted?: () => void;
  /** Other words for it, as Revoke for a key. */
  labels?: { action: string; confirm: string; done: string };
  /** Asked from elsewhere (a menu's Delete, say): open or not, and no button of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("common");
  const words = labels ?? { action: t("delete"), confirm: t("confirmDelete", { name }), done: t("deleted", { name }) };
  const [asked, setAsked] = useState(false);
  const controlled = open !== undefined;
  const asking = controlled ? open : asked;
  const setAsking = (next: boolean) => {
    if (!next) setSure(false);
    return controlled ? onOpenChange?.(next) : setAsked(next);
  };
  // Counted once, when asked; not counted again after the delete, when the record is gone.
  const links = useQuery({
    queryKey: [`/impact/${impact}`],
    queryFn: () => api<{ goes: { what: string; count: number }[]; unlinked: { what: string; count: number }[] }>(`/impact/${impact}`),
    enabled: asking && !!impact,
    meta: { versioned: true },
    staleTime: 0,
    gcTime: 0,
  });
  const linked = !!links.data && links.data.goes.length + links.data.unlinked.length > 0;
  const [sure, setSure] = useState(false);
  const checkId = useId();
  const remove = useApiMutation(() => api(path, { method: "DELETE" }), {
    success: words.done,
    gone: path,
    onSuccess: () => {
      setAsking(false);
      onDeleted?.();
    },
  });
  return (
    <>
      {!controlled && (
        <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setAsking(true)}>
          <Trash2 />
          {words.action}
        </Button>
      )}
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">{words.confirm}</AlertDialogTitle>
            <AlertDialogDescription>{[detail, !labels && t("deleteForGood")].filter(Boolean).join(" ")}</AlertDialogDescription>
          </AlertDialogHeader>
          {impact && !links.data && !links.error && <Skeleton className="h-16 w-full" />}
          {links.data && linked && (
            <div className="space-y-3 rounded-lg border border-danger/40 bg-danger-soft/40 p-3 text-sm" data-delete-impact>
              <p className="font-medium">{t("impact.title")}</p>
              {links.data.goes.length > 0 && (
                <div>
                  <p className="text-muted-foreground">{t("impact.goes")}</p>
                  <ul className="list-inside list-disc">
                    {links.data.goes.map((l) => (
                      <li key={l.what}>{t(`impact.what.${l.what}` as "impact.what.tickets", { count: l.count })}</li>
                    ))}
                  </ul>
                </div>
              )}
              {links.data.unlinked.length > 0 && (
                <div>
                  <p className="text-muted-foreground">{t("impact.unlinked")}</p>
                  <ul className="list-inside list-disc">
                    {links.data.unlinked.map((l) => (
                      <li key={l.what}>{t(`impact.what.${l.what}` as "impact.what.tickets", { count: l.count })}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-start gap-2 border-t pt-3">
                <Checkbox id={checkId} checked={sure} onCheckedChange={(v) => setSure(v === true)} />
                <Label htmlFor={checkId} className="font-medium leading-snug">
                  {t("impact.confirm")}
                </Label>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              // Linked records listed: only once ticked. Still counting: not yet.
              disabled={remove.isPending || (!!impact && !links.data && !links.error) || (linked && !sure)}
              onClick={(e) => {
                // Stays open until it is done, so a failure can be seen.
                e.preventDefault();
                remove.mutate(undefined);
              }}
            >
              {words.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
