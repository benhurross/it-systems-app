"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { NumberField, SelectField, SwitchField, TextField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { EmailSettings, OutboxEmail, OutboxEmailDetail } from "@/lib/api-types";
import { SMTP_SECURITY } from "@/lib/domain";
import { emailSettings } from "@/lib/schemas";
import { SettingsCard } from "../settings-card";

type Input = z.input<typeof emailSettings>;
type Output = z.output<typeof emailSettings>;

export default function EmailSettingsPage() {
  const t = useTranslations("settings");
  const { data, isLoading } = useApi<EmailSettings>("/settings/email");
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(emailSettings) });
  useEffect(() => {
    if (!data) return;
    const values: Input & { hasPassword?: boolean } = { ...data, password: "" };
    delete values.hasPassword;
    form.reset(values);
  }, [data, form]);
  const save = useApiMutation((values: Output) => api("/settings/email", { method: "PUT", body: values }), {
    success: t("saved"),
    form,
  });

  return (
    <div className="space-y-6">
      <SettingsCard
        title={t("email.title")}
        description={t("email.description")}
        form={form}
        onSubmit={(v) => save.mutate(v)}
        pending={save.isPending}
        loading={isLoading}
      >
        <SwitchField name="enabled" label={t("email.enabled")} description={t("email.enabledHint")} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <TextField name="host" label={t("email.host")} description={t("email.hostHint")} dir="ltr" autoComplete="off" />
          <NumberField name="port" label={t("email.port")} min={1} />
        </div>
        <SelectField
          name="security"
          label={t("email.security")}
          options={SMTP_SECURITY.map((s) => ({ value: s, label: t(`email.securityOptions.${s}`) }))}
        />
        <TextField name="username" label={t("email.username")} description={t("email.usernameHint")} dir="ltr" autoComplete="off" />
        <TextField
          name="password"
          label={t("email.password")}
          description={data?.hasPassword ? t("email.passwordSaved") : t("email.passwordNone")}
          type="password"
          dir="ltr"
          autoComplete="new-password"
        />
        <SwitchField name="allowInvalidCert" label={t("email.allowInvalidCert")} description={t("email.allowInvalidCertHint")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="fromName" label={t("email.fromName")} />
          <TextField name="fromAddress" label={t("email.fromAddress")} type="email" dir="ltr" />
        </div>
        <TextField name="appUrl" label={t("email.appUrl")} description={t("email.appUrlHint")} type="url" dir="ltr" />
      </SettingsCard>
      <TestEmail />
      <Outbox />
    </div>
  );
}

function TestEmail() {
  const t = useTranslations("settings.email");
  const user = useCurrentUser();
  const id = useId();
  const [to, setTo] = useState(user.email);
  const send = useApiMutation(() => api<{ ok: boolean; error?: string }>("/settings/email/test", { body: { to } }), {
    onSuccess: (result) =>
      result.ok ? toast.success(t("testSent", { to })) : toast.error(t("testFailed", { error: result.error ?? "" })),
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t("testTitle")}</CardTitle>
        <CardDescription>{t("testDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate(undefined);
          }}
        >
          <div className="grid min-w-0 flex-1 basis-64 gap-2">
            <Label htmlFor={id}>{t("testTo")}</Label>
            <Input id={id} type="email" dir="ltr" required value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={send.isPending}>
            <Send />
            {t("testSend")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const col = columnHelper<OutboxEmail>();

function Outbox() {
  const t = useTranslations();
  const format = useFormat();
  const { data = [], isLoading } = useApi<OutboxEmail[]>("/settings/email/outbox");
  const [viewing, setViewing] = useState<number | null>(null);

  const columns = [
    col.accessor("createdAt", { header: t("settings.email.queued"), cell: (info) => format.dateTime(info.getValue()) }),
    col.accessor("recipient", { header: t("settings.email.to"), cell: (info) => <span dir="ltr">{info.getValue()}</span> }),
    col.accessor("subject", {
      header: t("settings.email.subject"),
      cell: (info) => <span className="block min-w-56 break-words">{info.getValue()}</span>,
    }),
    col.accessor("kind", { header: t("settings.email.kind"), cell: (info) => t(`enums.emailKind.${info.getValue()}`) }),
    col.accessor("status", {
      header: t("settings.email.status"),
      cell: (info) => (
        <div className="space-y-1">
          <EnumBadge kind="emailStatus" value={info.getValue()} />
          {info.row.original.error && <p className="max-w-64 text-xs break-words text-muted-foreground">{info.row.original.error}</p>}
        </div>
      ),
    }),
    col.accessor("attempts", { header: t("settings.email.attempts") }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">{t("common.actions")}</span>,
      cell: (info) => (
        <Button variant="ghost" size="sm" onClick={() => setViewing(info.row.original.id)}>
          {t("settings.email.view")}
        </Button>
      ),
    }),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.email.outbox")}</CardTitle>
        <CardDescription>{t("settings.email.outboxDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable data={data} columns={columns} loading={isLoading} />
      </CardContent>
      {viewing !== null && <Preview id={viewing} onClose={() => setViewing(null)} />}
    </Card>
  );
}

function Preview({ id, onClose }: { id: number; onClose: () => void }) {
  const t = useTranslations("settings.email");
  const { data } = useApi<OutboxEmailDetail>(`/settings/email/outbox/${id}`);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="break-words">{data?.subject ?? t("preview")}</DialogTitle>
          <DialogDescription dir="ltr">{data?.recipient}</DialogDescription>
        </DialogHeader>
        {data ? (
          // The message as sent, in a sandbox: nothing in it can run or reach this page.
          <iframe title={t("preview")} sandbox="" srcDoc={data.html} className="h-[60vh] w-full rounded-md border bg-white" />
        ) : (
          <Skeleton className="h-[60vh] w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}
