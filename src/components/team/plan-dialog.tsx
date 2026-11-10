"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { DeleteRecord } from "@/components/delete-record";
import { DateField, FormDialog, SelectField, TextareaField, TextField } from "@/components/form";
import { useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import type { TeamPlan } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { PLAN_KINDS, planInput, type PlanInput } from "@/lib/team";

/** An entry in one's own plan: work meant to be done, or days busy or away. */
export function PlanDialog({ plan, onClose }: { plan?: TeamPlan; onClose: () => void }) {
  const t = useTranslations("team.plans");
  const today = isoDate();
  const form = useForm<z.input<typeof planInput>, unknown, PlanInput>({
    resolver: zodResolver(planInput),
    defaultValues: plan
      ? { kind: plan.kind, title: plan.title, note: plan.note, startDate: plan.startDate, endDate: plan.endDate }
      : { kind: "work", title: "", startDate: today, endDate: today },
  });
  const save = useApiMutation((v: PlanInput) => (plan ? api(`/team/plans/${plan.id}`, { method: "PUT", body: v }) : api("/team/plans", { body: v })), {
    form,
    success: t("saved"),
    onSuccess: onClose,
  });
  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={plan ? t("edit") : t("add")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
      extra={plan && <DeleteRecord path={`/team/plans/${plan.id}`} name={plan.title} onDeleted={onClose} labels={{ action: t("delete"), confirm: t("deleteConfirm", { title: plan.title }), done: t("deleted") }} />}
    >
      <SelectField name="kind" label={t("kind")} options={PLAN_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))} />
      <TextField name="title" label={t("title")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField name="startDate" label={t("from")} />
        <DateField name="endDate" label={t("to")} />
      </div>
      <TextareaField name="note" label={t("note")} optional rows={2} />
    </FormDialog>
  );
}
