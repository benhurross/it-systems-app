"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { NumberField } from "@/components/form";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import { PRIORITIES } from "@/lib/domain";
import { slaSettings, ticketSettings } from "@/lib/schemas";
import type { SlaTargets } from "@/lib/sla";
import { SettingsCard } from "../settings-card";

export default function ServiceDeskSettings() {
  const t = useTranslations();
  const lookups = useLookups();
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
    <div className="space-y-6">
      <SettingsCard
        title={t("settings.sla.title")}
        description={t("settings.sla.description")}
        form={form}
        onSubmit={(v) => save.mutate(v)}
        pending={save.isPending}
        loading={isLoading || !lookups.ready}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {[...PRIORITIES].reverse().map((p) => (
            <NumberField key={p} name={p} label={`${t(`enums.priority.${p}`)} (${t("settings.sla.hours")})`} min={1} step={1} />
          ))}
        </div>
        <FieldSet>
          <FieldLegend>{t("settings.sla.byIssueType")}</FieldLegend>
          <FieldDescription>{t("settings.sla.byIssueTypeHint")}</FieldDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            {lookups.options("issue_type").map((o) => (
              <NumberField
                key={o.value}
                name={`byIssueType.${o.value}`}
                label={`${o.label} (${t("settings.sla.hours")})`}
                min={0.25}
                step={0.25}
                optional
              />
            ))}
          </div>
        </FieldSet>
      </SettingsCard>
      <ResolvedTickets />
    </div>
  );
}

type TicketSettings = z.output<typeof ticketSettings>;

function ResolvedTickets() {
  const t = useTranslations("settings");
  const { data, isLoading } = useApi<TicketSettings>("/settings/tickets");
  const form = useForm<z.input<typeof ticketSettings>, unknown, TicketSettings>({ resolver: zodResolver(ticketSettings) });
  useEffect(() => {
    if (data) form.reset(data);
  }, [data, form]);
  const save = useApiMutation((values: TicketSettings) => api("/settings/tickets", { method: "PUT", body: values }), {
    success: t("saved"),
    form,
  });

  return (
    <SettingsCard
      title={t("tickets.title")}
      description={t("tickets.description")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
      loading={isLoading}
    >
      <NumberField name="autoCloseDays" label={t("tickets.autoCloseDays")} min={1} step={1} />
    </SettingsCard>
  );
}
