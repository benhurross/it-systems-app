"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ComboboxField, FormDialog, NumberField, SelectField, SwitchField, TextareaField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { Employee, Purchase, Vendor } from "@/lib/api-types";
import { purchaseInput } from "@/lib/schemas";

type Input = z.input<typeof purchaseInput>;
type Output = z.output<typeof purchaseInput>;

/** Raises a purchase request, or edits one still waiting for a decision. */
export function PurchaseDialog({ purchase, onClose }: { purchase?: Purchase; onClose: () => void }) {
  const t = useTranslations();
  const lookups = useLookups();
  const { data: vendors = [] } = useApi<Vendor[]>("/vendors");
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(purchaseInput),
    defaultValues: purchase ? purchaseInput.parse(purchase) : { quantity: 1, hardware: false, vendorId: null, requestedFor: null },
  });
  const save = useApiMutation(
    (values: Output) =>
      purchase ? api(`/purchases/${purchase.id}`, { method: "PATCH", body: values }) : api("/purchases", { body: values }),
    { form, success: t("finance.purchases.saved"), onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={purchase ? t("finance.purchases.edit") : t("finance.purchases.new")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <TextField name="title" label={t("finance.purchases.item")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="category" label={t("finance.purchases.category")} options={lookups.options("budget_category")} />
        <SelectField
          name="vendorId"
          label={t("finance.purchases.vendor")}
          options={vendors.filter((v) => v.active || v.id === purchase?.vendorId).map((v) => ({ value: v.id, label: v.name }))}
          optional
        />
        <NumberField name="quantity" label={t("finance.purchases.quantity")} min={1} step={1} />
        <NumberField name="amount" label={t("finance.purchases.amount")} min={0} />
      </div>
      <ComboboxField
        name="requestedFor"
        label={t("finance.purchases.requestedFor")}
        options={employees.filter((e) => e.active || e.id === purchase?.requestedFor).map((e) => ({ value: e.id, label: e.name }))}
        optional
      />
      <SwitchField name="hardware" label={t("finance.purchases.hardware")} description={t("finance.purchases.hardwareHint")} />
      <TextareaField name="notes" label={t("common.notes")} rows={2} optional />
    </FormDialog>
  );
}
