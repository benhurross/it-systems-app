"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { NumberField, SwitchField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import type { MonitorSettings } from "@/lib/monitor";
import { monitorSettings } from "@/lib/schemas";
import { SettingsCard } from "../settings-card";

export default function MonitoringSettings() {
  const t = useTranslations("settings");
  const { data, isLoading } = useApi<MonitorSettings>("/settings/monitoring");
  const form = useForm<z.input<typeof monitorSettings>, unknown, z.output<typeof monitorSettings>>({
    resolver: zodResolver(monitorSettings),
  });
  useEffect(() => {
    if (data) form.reset(data);
  }, [data, form]);
  const save = useApiMutation((values: MonitorSettings) => api("/settings/monitoring", { method: "PUT", body: values }), {
    success: t("saved"),
    form,
  });

  return (
    <SettingsCard
      title={t("monitoring.title")}
      description={t("monitoring.description")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
      loading={isLoading}
    >
      <SwitchField name="enabled" label={t("monitoring.enabled")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField name="intervalSeconds" label={t("monitoring.interval")} min={15} />
        <NumberField name="timeoutMs" label={t("monitoring.timeout")} min={250} />
        <NumberField name="degradedMs" label={t("monitoring.degraded")} min={10} />
        <NumberField name="retentionDays" label={t("monitoring.retention")} min={1} />
      </div>
    </SettingsCard>
  );
}
