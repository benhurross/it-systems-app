"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ComboboxField, DateTimeField, FormDialog, NumberField, SelectField, TextareaField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Asset, Change } from "@/lib/api-types";
import { CHANGE_RISKS } from "@/lib/domain";
import { changeInput } from "@/lib/schemas";

type Input = z.input<typeof changeInput>;
type Output = z.output<typeof changeInput>;

/** Requests a new change, or corrects `change` while it is still open. */
export function ChangeDialog({ change, onClose }: { change?: Change; onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const { data: assets = [] } = useApi<Asset[]>("/assets");
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(changeInput),
    defaultValues: change ?? { title: "", description: "", reason: "", rollbackPlan: "", risk: "medium", assetId: null, ticketId: null },
  });
  const save = useApiMutation(
    (values: Output) =>
      change
        ? api<{ id: number }>(`/changes/${change.id}`, { method: "PATCH", body: values })
        : api<{ id: number }>("/changes", { body: values }),
    {
      form,
      success: t("changes.saved"),
      onSuccess: (saved) => {
        onClose();
        if (!change) router.push(`/changes/${saved.id}`);
      },
    },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={change ? t("changes.edit") : t("changes.new")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <TextField name="title" label={t("changes.changeTitle")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ComboboxField
          name="assetId"
          label={t("changes.asset")}
          options={assets.filter((a) => a.status !== "retired").map((a) => ({ value: a.id, label: a.name }))}
          optional
        />
        <SelectField
          name="risk"
          label={t("changes.risk")}
          options={CHANGE_RISKS.map((r) => ({ value: r, label: t(`enums.changeRisk.${r}`) }))}
        />
        <DateTimeField name="plannedAt" label={t("changes.planned")} />
        <TextField name="vendor" label={t("changes.vendor")} optional />
      </div>
      <TextareaField name="description" label={t("common.description")} rows={3} />
      <TextareaField name="reason" label={t("changes.reason")} rows={2} />
      <TextareaField name="rollbackPlan" label={t("changes.rollback")} rows={2} />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField name="ticketId" label={t("changes.ticket")} min={1} step={1} optional />
      </div>
      <TextareaField name="notes" label={t("common.notes")} rows={2} optional />
    </FormDialog>
  );
}
