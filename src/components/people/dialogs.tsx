"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ComboboxField, DateField, FormDialog, SelectField, SwitchField, TextareaField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { Employee, Leaver } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { employeeInput, joinerInput, leaverInput } from "@/lib/schemas";

export function EmployeeDialog({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const t = useTranslations("people");
  const lookups = useLookups();
  const form = useForm<z.input<typeof employeeInput>, unknown, z.output<typeof employeeInput>>({
    resolver: zodResolver(employeeInput),
    defaultValues: employee ?? { name: "", email: "", jobTitle: "", active: true },
  });
  const save = useApiMutation(
    (values: z.output<typeof employeeInput>) =>
      employee ? api(`/employees/${employee.id}`, { method: "PATCH", body: values }) : api("/employees", { body: values }),
    { form, success: t("directory.saved"), onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={employee ? t("directory.edit") : t("directory.add")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label={t("name")} />
        <TextField name="jobTitle" label={t("jobTitle")} />
        <TextField name="email" label={t("email")} type="email" dir="ltr" />
        <TextField name="phone" label={t("phone")} dir="ltr" optional />
        <TextField name="employeeNumber" label={t("employeeNumber")} dir="ltr" optional />
        <SelectField name="department" label={t("department")} options={lookups.options("department")} />
        <SelectField name="location" label={t("location")} options={lookups.options("location")} />
      </div>
      <SwitchField name="active" label={t("directory.active")} />
    </FormDialog>
  );
}

export function JoinerDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("people");
  const lookups = useLookups();
  const form = useForm<z.input<typeof joinerInput>, unknown, z.output<typeof joinerInput>>({
    resolver: zodResolver(joinerInput),
    defaultValues: { name: "", email: "", jobTitle: "" },
  });
  const save = useApiMutation((values: z.output<typeof joinerInput>) => api("/joiners", { body: values }), {
    form,
    success: t("onboarding.saved"),
    onSuccess: onClose,
  });

  return (
    <FormDialog open onOpenChange={onClose} title={t("onboarding.new")} form={form} onSubmit={(v) => save.mutate(v)} pending={save.isPending} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label={t("name")} />
        <TextField name="jobTitle" label={t("jobTitle")} />
        <TextField name="email" label={t("email")} type="email" dir="ltr" />
        <DateField name="startDate" label={t("onboarding.startDate")} />
        <TextField name="employeeNumber" label={t("employeeNumber")} dir="ltr" optional />
        <SelectField name="department" label={t("department")} options={lookups.options("department")} />
        <SelectField name="location" label={t("location")} options={lookups.options("location")} />
      </div>
    </FormDialog>
  );
}

/** Starts offboarding for someone still employed who is not already leaving. */
export function LeaverDialog({ leavers, onClose }: { leavers: Leaver[]; onClose: () => void }) {
  const t = useTranslations("people");
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const leaving = new Set(leavers.map((l) => l.employeeId));
  const form = useForm<z.input<typeof leaverInput>, unknown, z.output<typeof leaverInput>>({
    resolver: zodResolver(leaverInput),
    defaultValues: { resignationDate: isoDate(), forwardTo: null },
  });
  const save = useApiMutation((values: z.output<typeof leaverInput>) => api("/leavers", { body: values }), {
    form,
    success: t("offboarding.saved"),
    onSuccess: onClose,
  });

  return (
    <FormDialog open onOpenChange={onClose} title={t("offboarding.new")} form={form} onSubmit={(v) => save.mutate(v)} pending={save.isPending}>
      <ComboboxField
        name="employeeId"
        label={t("offboarding.employee")}
        options={employees.filter((e) => e.active && !leaving.has(e.id)).map((e) => ({ value: e.id, label: `${e.name} (${e.jobTitle})` }))}
      />
      <DateField name="resignationDate" label={t("offboarding.resignationDate")} />
      <TextField name="forwardTo" label={t("offboarding.forwardTo")} type="email" dir="ltr" optional />
      <TextareaField name="notes" label={t("offboarding.notes")} rows={2} optional />
    </FormDialog>
  );
}
