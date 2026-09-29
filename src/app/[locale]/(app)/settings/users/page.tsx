"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useFormContext } from "react-hook-form";
import { z } from "zod";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { columnHelper, DataTable } from "@/components/data-table";
import { FormDialog, SelectField, SwitchField, TextField } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { Employee, UserRow } from "@/lib/api-types";
import { ROLES, type Role } from "@/lib/permissions";
import { userCreate, userUpdate } from "@/lib/schemas";

const col = columnHelper<UserRow>();

/** 16 characters from a URL-safe alphabet, from the browser's secure generator. */
function generatePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 16);
}

export default function UsersPage() {
  const t = useTranslations();
  const format = useFormat();
  const me = useCurrentUser();
  const { data: users = [], isLoading } = useApi<UserRow[]>("/settings/users");
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const roleOptions = ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }));
  const employeeOptions = employees.map((e) => ({ value: e.id, label: `${e.name} (${e.email})` }));

  const columns = [
    col.accessor("name", {
      header: t("settings.users.name"),
      cell: (info) => (
        <span className="flex items-center gap-2 font-medium">
          {info.getValue()}
          {info.row.original.id === me.id && <Badge variant="secondary">{t("settings.users.you")}</Badge>}
        </span>
      ),
    }),
    col.accessor("email", { header: t("settings.users.email") }),
    col.accessor("role", {
      header: t("settings.users.role"),
      filterFn: "arrHas",
      cell: (info) => t(`roles.${info.getValue() as Role}`),
    }),
    col.accessor("employeeName", {
      header: t("settings.users.employee"),
      cell: (info) => info.getValue() ?? <span className="text-muted-foreground">{t("settings.users.noEmployee")}</span>,
    }),
    col.accessor((u) => (u.banned ? "deactivated" : "active"), {
      id: "status",
      header: t("settings.users.status"),
      filterFn: "arrHas",
      cell: (info) => (
        <StatusBadge tone={info.getValue() === "active" ? "success" : "neutral"}>
          {t(`settings.users.${info.getValue() as "active"}`)}
        </StatusBadge>
      ),
    }),
    col.accessor("createdAt", { header: t("common.date"), cell: (info) => format.date(info.getValue()) }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">{t("common.actions")}</span>,
      cell: (info) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(info.row.original)}>
          {t("common.edit")}
        </Button>
      ),
    }),
  ];

  return (
    <>
      <DataTable
        data={users}
        columns={columns}
        loading={isLoading}
        facets={[
          { column: "role", label: t("settings.users.role"), options: roleOptions },
          {
            column: "status",
            label: t("settings.users.status"),
            options: [
              { value: "active", label: t("settings.users.active") },
              { value: "deactivated", label: t("settings.users.deactivated") },
            ],
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus />
            {t("settings.users.add")}
          </Button>
        }
      />
      {adding && (
        <AddUserDialog
          onClose={() => setAdding(false)}
          roleOptions={roleOptions}
          employeeOptions={employeeOptions}
        />
      )}
      {editing && (
        <EditUserDialog
          user={editing}
          self={editing.id === me.id}
          onClose={() => setEditing(null)}
          roleOptions={roleOptions}
          employeeOptions={employeeOptions}
        />
      )}
    </>
  );
}

type Options = { value: string | number; label: string }[];

function PasswordField({ name, label }: { name: string; label: string }) {
  const t = useTranslations("settings.users");
  const { setValue } = useFormContext();
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <TextField name={name} label={label} description={t("passwordHint")} dir="ltr" autoComplete="new-password" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="mb-7"
        onClick={() => setValue(name, generatePassword(), { shouldValidate: true })}
      >
        <Wand2 />
        {t("generate")}
      </Button>
    </div>
  );
}

function AddUserDialog({
  onClose,
  roleOptions,
  employeeOptions,
}: {
  onClose: () => void;
  roleOptions: Options;
  employeeOptions: Options;
}) {
  const t = useTranslations("settings.users");
  const form = useForm<z.input<typeof userCreate>, unknown, z.output<typeof userCreate>>({
    resolver: zodResolver(userCreate),
    defaultValues: { name: "", email: "", role: "employee", employeeId: null, password: generatePassword() },
  });
  const create = useApiMutation((values: z.output<typeof userCreate>) => api("/settings/users", { body: values }), {
    success: t("created"),
    form,
    onSuccess: onClose,
  });

  return (
    <FormDialog open onOpenChange={onClose} title={t("add")} form={form} onSubmit={(v) => create.mutate(v)} pending={create.isPending}>
      <TextField name="name" label={t("name")} autoComplete="off" />
      <TextField name="email" label={t("email")} type="email" dir="ltr" autoComplete="off" />
      <SelectField name="role" label={t("role")} options={roleOptions} />
      <SelectField name="employeeId" label={t("employee")} options={employeeOptions} optional />
      <PasswordField name="password" label={t("password")} />
    </FormDialog>
  );
}

function EditUserDialog({
  user,
  self,
  onClose,
  roleOptions,
  employeeOptions,
}: {
  user: UserRow;
  self: boolean;
  onClose: () => void;
  roleOptions: Options;
  employeeOptions: Options;
}) {
  const t = useTranslations("settings.users");
  const form = useForm<z.input<typeof userUpdate>, unknown, z.output<typeof userUpdate>>({
    resolver: zodResolver(userUpdate),
    defaultValues: { role: user.role as Role, employeeId: user.employeeId, active: !user.banned, password: undefined },
  });
  const save = useApiMutation(
    (values: z.output<typeof userUpdate>) =>
      api(`/settings/users/${user.id}`, {
        method: "PATCH",
        // Leave out what an admin may not change about themselves, and an empty password.
        body: { ...values, ...(self && { role: undefined, active: undefined }), password: values.password || undefined },
      }),
    { success: t("updated"), form, onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={`${t("edit")}: ${user.name}`}
      description={self ? t("selfNote") : undefined}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
    >
      {!self && <SelectField name="role" label={t("role")} options={roleOptions} />}
      <SelectField name="employeeId" label={t("employee")} options={employeeOptions} optional />
      {!self && <SwitchField name="active" label={t("active")} description={t("deactivateConfirm", { name: user.name })} />}
      <TextField name="password" label={t("newPassword")} dir="ltr" autoComplete="new-password" optional />
    </FormDialog>
  );
}
