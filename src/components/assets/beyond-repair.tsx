"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormDialog, TextareaField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { AssetDetail } from "@/lib/api-types";

const schema = z.object({ reason: z.string().trim().min(3, "validation.required").max(500) });

/** "Mark as beyond repair", with the reason: only then is the asset due for replacement. */
export function MarkBeyondRepair({ asset }: { asset: AssetDetail }) {
  const t = useTranslations("assets.beyondRepair");
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { reason: "" } });
  const mark = useApiMutation((v: z.output<typeof schema>) => api(`/assets/${asset.id}/beyond-repair`, { body: v }), {
    form,
    success: t("marked"),
    onSuccess: () => setOpen(false),
  });
  if (asset.beyondRepairAt || asset.status === "retired") return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Wrench />
        {t("mark")}
      </Button>
      {open && (
        <FormDialog open onOpenChange={setOpen} title={t("title", { name: asset.name })} description={t("hint")} form={form} onSubmit={(v) => mark.mutate(v)} pending={mark.isPending} submitLabel={t("confirm")}>
          <TextareaField name="reason" label={t("reason")} description={t("reasonHint")} rows={3} />
        </FormDialog>
      )}
    </>
  );
}

/** On a page of an asset marked beyond repair: why, who and when, and the way to take it back. */
export function BeyondRepairNote({ asset }: { asset: AssetDetail }) {
  const t = useTranslations("assets.beyondRepair");
  const format = useFormat();
  const clear = useApiMutation(() => api(`/assets/${asset.id}/beyond-repair`, { method: "DELETE" }), { success: t("cleared") });
  if (!asset.beyondRepairAt) return null;
  return (
    <div role="note" className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <div className="space-y-0.5">
        <p className="font-medium text-destructive">{t("noteTitle")}</p>
        <p>{asset.beyondRepairReason}</p>
        <p className="text-xs text-muted-foreground">{t("noteBy", { by: asset.beyondRepairBy ?? "—", date: format.date(asset.beyondRepairAt) })}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => clear.mutate(undefined)} disabled={clear.isPending}>
        {t("clear")}
      </Button>
    </div>
  );
}
