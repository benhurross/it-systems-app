"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm, useFormContext, useWatch } from "react-hook-form";
import type { z } from "zod";
import { EnumBadge } from "@/components/badges";
import { ComboboxField, FormDialog, TextareaField } from "@/components/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import type { Asset, ChecklistItem, Employee } from "@/lib/api-types";
import { WORKSTATION_ITEM_STATES } from "@/lib/domain";
import { workstationCheckInput } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Input = z.input<typeof workstationCheckInput>;
type Output = z.output<typeof workstationCheckInput>;

/** A new workstation check: the computer, each checklist item as found, and a word for the employee. */
export function CheckDialog({ assetId, onClose, onSaved }: { assetId?: number; onClose: () => void; onSaved?: (id: number) => void }) {
  const { data: checklist } = useApi<ChecklistItem[]>("/workstation-checks/checklist");
  if (!checklist) return <Skeleton className="sr-only" />;
  return <CheckForm checklist={checklist} assetId={assetId} onClose={onClose} onSaved={onSaved} />;
}

function CheckForm({ checklist, assetId, onClose, onSaved }: { checklist: ChecklistItem[]; assetId?: number; onClose: () => void; onSaved?: (id: number) => void }) {
  const t = useTranslations();
  const { data: assets = [] } = useApi<Asset[]>("/assets");
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(workstationCheckInput),
    defaultValues: { assetId, employeeId: null, message: "", items: checklist.map((i) => ({ code: i.code, state: "ok", note: "" })) },
  });
  // Desks have end-user devices; servers and switches are not checked this way. All, if none is filed so.
  const inUse = assets.filter((a) => a.status !== "retired");
  const endUser = inUse.filter((a) => a.category === "end_user" || a.id === assetId);
  const computers = endUser.some((a) => a.category === "end_user") ? endUser : inUse;
  const watchedAsset = useWatch({ control: form.control, name: "assetId" });
  const chosen = assets.find((a) => a.id === watchedAsset);
  const save = useApiMutation((values: Output) => api<{ id: number }>("/workstation-checks", { body: values }), {
    form,
    success: t("workstation.saved"),
    onSuccess: (saved) => {
      onClose();
      onSaved?.(saved.id);
    },
  });

  return (
    <FormDialog open onOpenChange={onClose} title={t("workstation.new")} description={t("workstation.newHint")} form={form} onSubmit={(v) => save.mutate(v)} pending={save.isPending} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <ComboboxField name="assetId" label={t("workstation.computer")} options={computers.map((a) => ({ value: a.id, label: a.name }))} />
        <ComboboxField
          name="employeeId"
          label={t("workstation.employee")}
          options={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name }))}
          placeholder={chosen?.assignedName ? t("workstation.assignedTo", { name: chosen.assignedName }) : t("workstation.nobody")}
          description={t("workstation.employeeHint")}
          optional
        />
      </div>
      <Checklist checklist={checklist} />
      <TextareaField name="message" label={t("workstation.message")} description={t("workstation.messageHint")} rows={2} optional />
    </FormDialog>
  );
}

/** Each item with OK / Not OK / N/A, and what to fix when it is not OK; the result as it stands. */
function Checklist({ checklist }: { checklist: ChecklistItem[] }) {
  const t = useTranslations("workstation");
  const locale = useLocale();
  const { control, register } = useFormContext<Input>();
  const items = useWatch({ control, name: "items" }) ?? [];
  const result = items.some((i) => i.state === "not_ok") ? "attention" : "passed";
  return (
    <section className="space-y-2" aria-labelledby="checklist-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="checklist-title" className="text-sm font-medium">
          {t("checklist")}
        </h3>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("resultSoFar")} <EnumBadge kind="workstationResult" value={result} />
        </span>
      </div>
      <ol className="divide-y rounded-lg border">
        {checklist.map((item, i) => {
          const label = locale === "ar" ? item.labelAr : item.labelEn;
          const state = items[i]?.state;
          return (
            <li key={item.code} className={cn("space-y-2 p-3", state === "not_ok" && "bg-warning-soft")}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span id={`item-${item.code}`} className="min-w-0 flex-1 basis-56 text-sm">
                  {label}
                </span>
                <Controller
                  control={control}
                  name={`items.${i}.state`}
                  render={({ field }) => (
                    <RadioGroup aria-labelledby={`item-${item.code}`} value={field.value} onValueChange={field.onChange} className="flex gap-3">
                      {WORKSTATION_ITEM_STATES.map((s) => (
                        <label key={s} className="flex items-center gap-1.5 text-sm">
                          <RadioGroupItem value={s} />
                          {t(`states.${s}`)}
                        </label>
                      ))}
                    </RadioGroup>
                  )}
                />
              </div>
              {state === "not_ok" && (
                <Input {...register(`items.${i}.note`)} aria-label={t("noteFor", { item: label })} placeholder={t("notePlaceholder")} maxLength={500} />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
