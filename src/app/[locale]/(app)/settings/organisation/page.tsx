"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { SelectField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { organisationSettings } from "@/lib/schemas";
import { SettingsCard } from "../settings-card";

type Organisation = z.output<typeof organisationSettings>;

export default function OrganisationSettings() {
  const t = useTranslations();
  const { data, isLoading } = useApi<Organisation>("/settings/organisation");
  const form = useForm<z.input<typeof organisationSettings>, unknown, Organisation>({
    resolver: zodResolver(organisationSettings),
  });
  useEffect(() => {
    if (data) form.reset(data);
  }, [data, form]);
  const save = useApiMutation((values: Organisation) => api("/settings/organisation", { method: "PUT", body: values }), {
    success: t("settings.saved"),
    form,
  });
  const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: t(`months.${String(i + 1) as "1"}`) }));

  return (
    <SettingsCard
      title={t("settings.organisation.title")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
      loading={isLoading}
    >
      <TextField name="name" label={t("settings.organisation.name")} />
      <SelectField name="fiscalYearStartMonth" label={t("settings.organisation.fiscalStart")} options={months} />
    </SettingsCard>
  );
}
