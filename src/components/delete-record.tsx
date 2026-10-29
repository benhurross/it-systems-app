"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";

/**
 * Delete, asked first: removes the record at `path` (as /projects/3) for good, then `onDeleted`
 * (to leave its page, say). `detail` says what else goes with it.
 */
export function DeleteRecord({
  path,
  name,
  detail,
  onDeleted,
  labels,
  open,
  onOpenChange,
}: {
  path: string;
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
  const setAsking = (next: boolean) => (controlled ? onOpenChange?.(next) : setAsked(next));
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
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
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
