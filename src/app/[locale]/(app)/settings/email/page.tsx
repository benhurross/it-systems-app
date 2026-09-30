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

  // Wide screens: the settings and the test on the left, the outbox beside them.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <SettingsCard
          title={t("email.title")}
          description={t("email.description")}
          form={form}
          onSubmit={(v) => save.mutate(v)}
          pending={save.isPending}
          loading={isLoading}
          className="xl:max-w-none"
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
          <NumberField name="retentionDays" label={t("email.retentionDays")} description={t("email.retentionHint")} min={7} />
        </SettingsCard>
          <TestEmail />
      </div>
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
    <Card className="max-w-2xl xl:max-w-none">
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

const FILTERS = ["all", "failed", "held", "sent"] as const;

/** The latest messages as a compact list, to sit beside the settings; a filter picks out problems. */
function Outbox() {
  const t = useTranslations();
  const format = useFormat();
  const { data = [], isLoading } = useApi<OutboxEmail[]>("/settings/email/outbox");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [viewing, setViewing] = useState<number | null>(null);
  const shown = filter === "all" ? data : data.filter((e) => e.status === filter);

  return (
    <Card className="xl:sticky xl:top-20">
      <CardHeader>
        <CardTitle>{t("settings.email.outbox")}</CardTitle>
        <CardDescription>{t("settings.email.outboxDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div role="group" aria-label={t("settings.email.show")} className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button key={f} type="button" size="sm" variant={filter === f ? "secondary" : "ghost"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? t("settings.email.all") : t(`enums.emailStatus.${f}`)}
            </Button>
          ))}
        </div>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("settings.email.empty")}</p>
        ) : (
          <ul aria-label={t("settings.email.outbox")} className="divide-y text-sm xl:max-h-[calc(100dvh-16rem)] xl:overflow-y-auto">
            {shown.map((email) => (
              <li key={email.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3">
                <div className="min-w-0 flex-1 basis-56 space-y-1">
                  <p className="font-medium break-words">{email.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`enums.emailKind.${email.kind}`)} · <span dir="ltr">{email.recipient}</span> · {format.dateTime(email.createdAt)}
                    {email.attempts > 1 && ` · ${t("settings.email.attemptsCount", { count: email.attempts })}`}
                  </p>
                  {email.error && <p className="text-xs break-words text-destructive">{email.error}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <EnumBadge kind="emailStatus" value={email.status} />
                  <Button variant="ghost" size="sm" onClick={() => setViewing(email.id)} aria-label={t("settings.email.viewEmail", { subject: email.subject })}>
                    {t("settings.email.view")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
