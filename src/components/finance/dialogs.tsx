"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  ComboboxField,
  DateField,
  FormDialog,
  NumberField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { Contract, Employee, Purchase, Vendor } from "@/lib/api-types";
import { budgetInput, contractInput, purchaseInput, vendorInput } from "@/lib/schemas";

function useVendorOptions() {
  const { data: vendors = [] } = useApi<Vendor[]>("/vendors");
  return vendors.map((v) => ({ value: v.id, label: v.name }));
}

/** Raises a purchase request, or edits one still awaiting a decision. */
export function PurchaseDialog({ purchase, onClose }: { purchase?: Purchase; onClose: () => void }) {
  const t = useTranslations("finance.purchases");
  const lookups = useLookups();
  const vendors = useVendorOptions();
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const form = useForm<z.input<typeof purchaseInput>, unknown, z.output<typeof purchaseInput>>({
    resolver: zodResolver(purchaseInput),
    defaultValues: purchase ?? { title: "", quantity: 1, hardware: false, vendorId: null, requestedFor: null },
  });
  const save = useApiMutation(
    (values: z.output<typeof purchaseInput>) =>
      purchase ? api(`/purchases/${purchase.id}`, { method: "PATCH", body: values }) : api("/purchases", { body: values }),
    { form, success: t("saved"), onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={purchase ? t("edit") : t("new")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <TextField name="title" label={t("item")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="category" label={t("category")} options={lookups.options("budget_category")} />
        <SelectField name="vendorId" label={t("vendor")} options={vendors} optional />
        <NumberField name="quantity" label={t("quantity")} min={1} step={1} />
        <NumberField name="amount" label={t("amount")} min={0} />
        <ComboboxField
          name="requestedFor"
          label={t("requestedFor")}
          options={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name }))}
          optional
        />
      </div>
      <SwitchField name="hardware" label={t("hardware")} />
      <TextareaField name="notes" label={t("notes")} rows={2} optional />
    </FormDialog>
  );
}

export function ContractDialog({ contract, onClose }: { contract?: Contract; onClose: () => void }) {
  const t = useTranslations("finance.contracts");
  const lookups = useLookups();
  const vendors = useVendorOptions();
  const form = useForm<z.input<typeof contractInput>, unknown, z.output<typeof contractInput>>({
    resolver: zodResolver(contractInput),
    defaultValues: contract ?? { title: "", autoRenew: false, vendorId: null, location: null },
  });
  const save = useApiMutation(
    (values: z.output<typeof contractInput>) =>
      contract ? api(`/contracts/${contract.id}`, { method: "PATCH", body: values }) : api("/contracts", { body: values }),
    { form, success: t("saved"), onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={contract ? t("edit") : t("add")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <TextField name="title" label={t("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="vendorId" label={t("vendor")} options={vendors} optional />
        <SelectField name="category" label={t("category")} options={lookups.options("budget_category")} />
        <DateField name="startDate" label={t("start")} />
        <DateField name="endDate" label={t("end")} />
        <NumberField name="annualCost" label={t("annualCost")} min={0} />
        <SelectField name="location" label={t("location")} options={lookups.options("location")} optional />
      </div>
      <SwitchField name="autoRenew" label={t("autoRenew")} />
      <TextareaField name="notes" label={t("notes")} rows={2} optional />
    </FormDialog>
  );
}

export function VendorDialog({ vendor, onClose }: { vendor?: Vendor; onClose: () => void }) {
  const t = useTranslations("finance.vendors");
  const lookups = useLookups();
  const form = useForm<z.input<typeof vendorInput>, unknown, z.output<typeof vendorInput>>({
    resolver: zodResolver(vendorInput),
    defaultValues: vendor ?? { name: "", active: true },
  });
  const save = useApiMutation(
    (values: z.output<typeof vendorInput>) =>
      vendor ? api(`/vendors/${vendor.id}`, { method: "PATCH", body: values }) : api("/vendors", { body: values }),
    { form, success: t("saved"), onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={vendor ? t("edit") : t("add")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label={t("name")} />
        <SelectField name="category" label={t("category")} options={lookups.options("vendor_category")} />
        <TextField name="contactName" label={t("contact")} optional />
        <TextField name="email" label={t("email")} type="email" dir="ltr" optional />
        <TextField name="phone" label={t("phone")} dir="ltr" optional />
        <TextField name="website" label={t("website")} type="url" dir="ltr" optional />
      </div>
      <SwitchField name="active" label={t("active")} />
      <TextareaField name="notes" label={t("notes")} rows={2} optional />
    </FormDialog>
  );
}

/** Sets one category's budget for a fiscal year. */
export function BudgetDialog({
  year,
  category,
  amount,
  onClose,
}: {
  year: number;
  category: string;
  amount: number;
  onClose: () => void;
}) {
  const t = useTranslations("finance.budget");
  const lookups = useLookups();
  const form = useForm<z.input<typeof budgetInput>, unknown, z.output<typeof budgetInput>>({
    resolver: zodResolver(budgetInput),
    defaultValues: { fiscalYear: year, category, amount },
  });
  const save = useApiMutation((values: z.output<typeof budgetInput>) => api("/budgets", { method: "PUT", body: values }), {
    form,
    success: t("saved"),
    onSuccess: onClose,
  });

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("setTitle", { category: lookups.label("budget_category", category), year: String(year) })}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
    >
      <NumberField name="amount" label={t("amount")} min={0} step={1000} />
    </FormDialog>
  );
}
