"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { NumberField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { PRIORITIES } from "@/lib/domain";
import { slaSettings } from "@/lib/schemas";
import type { SlaTargets } from "@/lib/sla";
import { SettingsCard } from "../settings-card";

export default function ServiceDeskSettings() {
  const t = useTranslations();
  const { data, isLoading } = useApi<SlaTargets>("/settings/sla");
  const form = useForm<z.input<typeof slaSettings>, unknown, z.output<typeof slaSettings>>({
    resolver: zodResolver(slaSettings),
  });
  useEffect(() => {
    if (data) form.reset(data);
  }, [data, form]);
  const save = useApiMutation((values: SlaTargets) => api("/settings/sla", { method: "PUT", body: values }), {
    success: t("settings.saved"),
    form,
  });

  return (
    <SettingsCard
      title={t("settings.sla.title")}
      description={t("settings.sla.description")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
      loading={isLoading}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {[...PRIORITIES].reverse().map((p) => (
          <NumberField key={p} name={p} label={`${t(`enums.priority.${p}`)} (${t("settings.sla.hours")})`} min={1} step={1} />
        ))}
      </div>
    </SettingsCard>
  );
}
