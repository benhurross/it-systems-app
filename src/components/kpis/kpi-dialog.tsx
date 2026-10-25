"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { DeleteRecord } from "@/components/delete-record";
import { ComboboxField, FormDialog, NumberField, SelectField, SwitchField, TextareaField, TextField } from "@/components/form";
import { FieldSeparator } from "@/components/ui/field";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { KpiRow, Staff } from "@/lib/api-types";
import { KPI_LEVELS, KPI_PERIODS, KPI_SOURCES, KPI_UNITS, TICKET_TYPES } from "@/lib/domain";
import { kpiInput } from "@/lib/schemas";

/** The KPI and its baseline, target and weight for the year, as one form; shares entered as percentages. */
const form = kpiInput.extend({
  baseline: z.number().min(0).nullable(),
  baselineNote: z.string().trim().max(2_000).nullish().transform((v) => v ?? ""),
  target: z.number().min(0),
  weight: z.number().min(0).max(100).nullable(),
});
type FormIn = z.input<typeof form>;
type FormOut = z.output<typeof form>;

// Shares are kept as fractions and shown as percentages, rounded past float noise (0.68 * 100).
const toPercent = (v: number | null) => (v === null ? null : Math.round(v * 1_000_000) / 10_000);
const fromPercent = (v: number | null) => (v === null ? null : v / 100);

const BLANK: Partial<FormIn> = {
  level: "employee",
  department: "IT",
  higherIsBetter: true,
  period: "month",
  unit: "percent",
  targetFor: "period",
  source: "manual",
  filter: {},
  active: true,
  sortOrder: 50,
  baseline: null,
  weight: null,
};

/** Adds a KPI, or changes `kpi`: what it is, whose, where its figure comes from, and the year's baseline, target and weight. */
export function KpiDialog({ kpi, year, onClose }: { kpi?: KpiRow; year: number; onClose: () => void }) {
  const t = useTranslations();
  const lookups = useLookups();
  const { data: staff = [] } = useApi<Staff[]>("/staff");
  const percent = (unit: string | undefined, v: number | null) => (unit === "percent" ? toPercent(v) : v);
  const values = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(form),
    defaultValues: kpi
      ? {
          ...kpi,
          filter: { type: kpi.filter.type ?? null, issueType: kpi.filter.issueType ?? null, assigneeId: kpi.filter.assigneeId ?? null, documented: kpi.filter.documented ?? false },
          baseline: percent(kpi.unit, kpi.settings.baseline),
          baselineNote: kpi.settings.baselineNote,
          target: percent(kpi.unit, kpi.settings.target) ?? 0,
          weight: kpi.settings.weight,
        }
      : BLANK,
  });
  const [unit, source] = useWatch({ control: values.control, name: ["unit", "source"] });
  const save = useApiMutation(
    async ({ baseline, baselineNote, target, weight, ...input }: FormOut) => {
      const settings = {
        baseline: input.unit === "percent" ? fromPercent(baseline) : baseline,
        baselineNote,
        target: input.unit === "percent" ? fromPercent(target)! : target,
        weight,
      };
      if (!kpi) return api("/kpis", { body: { kpi: input, settings, year } });
      await api(`/kpis/${kpi.id}`, { method: "PATCH", body: input });
      return api(`/kpis/${kpi.id}/years/${year}`, { method: "PUT", body: settings });
    },
    { form: values, success: t("kpis.savedKpi"), onSuccess: onClose },
  );
  const options = <T extends string>(kind: string, list: readonly T[]) => list.map((v) => ({ value: v, label: t(`kpis.${kind}.${v}` as "kpis.units.percent") }));
  const share = unit === "percent" ? " (%)" : "";

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={kpi ? t("kpis.editKpi", { code: kpi.code }) : t("kpis.addKpi")}
      form={values}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
      wide
      extra={kpi && <DeleteRecord path={`/kpis/${kpi.id}`} name={`${kpi.code} ${kpi.name}`} detail={t("kpis.deleteDetail")} onDeleted={onClose} />}
    >
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <TextField name="code" label={t("kpis.code")} dir="ltr" />
        <TextField name="name" label={t("kpis.name")} />
      </div>
      <TextField name="nameAr" label={t("kpis.nameAr")} optional />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="level" label={t("kpis.level")} options={options("levels", KPI_LEVELS)} />
        <TextField name="department" label={t("kpis.department")} />
        <TextField name="role" label={t("kpis.role")} description={t("kpis.roleHint")} optional />
        <ComboboxField name="ownerId" label={t("kpis.owner")} options={staff.map((s) => ({ value: s.id, label: s.name }))} optional />
      </div>
      <TextareaField name="definition" label={t("kpis.definition")} rows={2} optional />
      <TextareaField name="formula" label={t("kpis.formula")} rows={2} optional />

      <FieldSeparator>{t("kpis.measuring")}</FieldSeparator>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="unit" label={t("kpis.unit")} options={options("units", KPI_UNITS)} />
        <SelectField name="period" label={t("kpis.recordedBy")} options={options("periods", KPI_PERIODS)} />
        <TextField name="frequency" label={t("kpis.frequency")} description={t("kpis.frequencyHint")} optional />
        <SelectField name="targetFor" label={t("kpis.targetFor")} options={[{ value: "period", label: t("kpis.targetForPeriod") }, { value: "year", label: t("kpis.targetForYear") }]} />
      </div>
      <SwitchField name="higherIsBetter" label={t("kpis.higherIsBetter")} />
      <SelectField name="source" label={t("kpis.source")} description={t(`kpis.sourceHints.${source ?? "manual"}`)} options={options("sources", KPI_SOURCES)} />
      {source && source !== "manual" && (
        <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
          <SelectField name="filter.type" label={t("kpis.filterType")} options={TICKET_TYPES.map((v) => ({ value: v, label: t(`enums.ticketType.${v}`) }))} optional />
          <SelectField name="filter.issueType" label={t("kpis.filterIssueType")} options={lookups.options("issue_type")} optional />
          <ComboboxField name="filter.assigneeId" label={t("kpis.filterAssignee")} options={staff.map((s) => ({ value: s.id, label: s.name }))} optional />
          {source === "ticket_sla" && <SwitchField name="filter.documented" label={t("kpis.filterDocumented")} />}
        </div>
      )}

      <FieldSeparator>{t("kpis.yearSettings", { year })}</FieldSeparator>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField name="baseline" label={`${t("kpis.baseline")}${share}`} min={0} step={0.01} optional />
        <NumberField name="target" label={`${t("kpis.target")}${share}`} min={0} step={0.01} />
        <NumberField name="weight" label={t("kpis.weight")} description={t("kpis.weightHint")} min={0} step={1} optional />
      </div>
      <TextareaField name="baselineNote" label={t("kpis.baselineNote")} rows={2} optional />

      <FieldSeparator>{t("kpis.review")}</FieldSeparator>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="dataSource" label={t("kpis.dataSource")} optional />
        <TextField name="reviewer" label={t("kpis.reviewer")} optional />
      </div>
      <TextareaField name="redFlag" label={t("kpis.redFlag")} rows={2} optional />
      <TextareaField name="notes" label={t("kpis.notes")} rows={2} optional />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField name="sortOrder" label={t("kpis.sortOrder")} min={0} step={1} />
        <SwitchField name="active" label={t("kpis.active")} />
      </div>
    </FormDialog>
  );
}
