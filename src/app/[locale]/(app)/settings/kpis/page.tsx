"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { NumberField } from "@/components/form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { KPI_KEYS } from "@/lib/domain";
import type { KpiTargets } from "@/lib/kpis";
import { kpiTargetsInput } from "@/lib/schemas";
import { SettingsCard } from "../settings-card";

// The SLA share is stored as a ratio and edited as a percentage, rounded past float noise (0.68 * 100).
const percent = (ratio: number) => Math.round(ratio * 10_000) / 100;
const toForm = (targets: KpiTargets): KpiTargets => ({
  ...targets,
  tat: { baseline: percent(targets.tat.baseline), target: percent(targets.tat.target) },
});
const fromForm = (targets: KpiTargets): KpiTargets => ({
  ...targets,
  tat: { baseline: targets.tat.baseline / 100, target: targets.tat.target / 100 },
});

export default function KpiSettings() {
  const t = useTranslations();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const { data, isLoading } = useApi<KpiTargets>(`/settings/kpi-targets?year=${year}`);
  const form = useForm<KpiTargets>({ resolver: zodResolver(kpiTargetsInput.shape.targets) });
  useEffect(() => {
    if (data) form.reset(toForm(data));
  }, [data, form]);
  const save = useApiMutation(
    (targets: KpiTargets) => api("/settings/kpi-targets", { method: "PUT", body: { year, targets: fromForm(targets) } }),
    { success: t("settings.saved"), form },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label htmlFor="kpi-year">{t("settings.kpis.year")}</Label>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger id="kpi-year" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SettingsCard
        title={t("settings.kpis.title")}
        description={t("settings.kpis.description")}
        form={form}
        onSubmit={(v) => save.mutate(v)}
        pending={save.isPending}
        loading={isLoading}
      >
        {KPI_KEYS.map((kpi) => (
          <fieldset key={kpi} className="grid gap-3 border-b pb-4 last:border-0 sm:grid-cols-[1fr_8rem_8rem] sm:items-end">
            <legend className="mb-2 text-sm font-medium sm:mb-0 sm:self-center">
              {t(`kpi.${kpi}`)}
              {kpi === "tat" && " (%)"}
            </legend>
            <NumberField name={`${kpi}.baseline`} label={t("settings.kpis.baseline")} step={0.1} min={0} />
            <NumberField name={`${kpi}.target`} label={t("settings.kpis.target")} step={0.1} min={0} />
          </fieldset>
        ))}
      </SettingsCard>
    </div>
  );
}
