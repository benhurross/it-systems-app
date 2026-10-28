"use client";

import { Hint } from "@/components/hint";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormDialog, NumberField, TextareaField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { KpiRow } from "@/lib/api-types";
import type { KpiCell } from "@/lib/kpi-register";
import { showKpi } from "./show";

const form = z
  .object({
    numerator: z.number().min(0).nullable(),
    denominator: z.number().min(0).nullable(),
    value: z.number().min(0).nullable(),
    note: z.string().trim().max(2_000).nullish().transform((v) => v ?? ""),
  })
  .refine((f) => (f.numerator === null) === (f.denominator === null), { message: "validation.kpiCounts", path: ["denominator"] })
  .refine((f) => f.denominator === null || (f.denominator > 0 && f.numerator! <= f.denominator), { message: "validation.kpiCounts", path: ["denominator"] });
type Form = z.output<typeof form>;

/** Records one month's or quarter's figure for a KPI: counted (48 of 50), or a value, with a note. */
export function FigureDialog({ kpi, cell, year, label, onClose }: { kpi: KpiRow; cell: KpiCell; year: number; label: string; onClose: () => void }) {
  const t = useTranslations();
  const format = useFormat();
  const percent = kpi.unit === "percent";
  const entered = cell.from === "entered";
  const values = useForm<z.input<typeof form>, unknown, Form>({
    resolver: zodResolver(form),
    defaultValues: {
      numerator: entered ? cell.numerator : null,
      denominator: entered ? cell.denominator : null,
      // A share without counts is entered as a percentage.
      value: entered && cell.numerator === null && cell.value !== null ? (percent ? Math.round(cell.value * 1_000_000) / 10_000 : cell.value) : null,
      note: cell.note,
    },
  });
  const save = useApiMutation(
    (f: Form) =>
      api(`/kpis/${kpi.id}/figures`, {
        method: "PUT",
        body: { year, period: cell.period, ...f, value: f.numerator !== null ? null : percent && f.value !== null ? f.value / 100 : f.value },
      }),
    { form: values, success: t("kpis.figureSaved"), onSuccess: onClose },
  );
  const clear = useApiMutation(() => api(`/kpis/${kpi.id}/figures`, { method: "PUT", body: { year, period: cell.period, numerator: null, denominator: null, value: null, note: "" } }), {
    success: t("kpis.figureCleared"),
    onSuccess: onClose,
  });

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("kpis.figureTitle", { kpi: `${kpi.code} ${kpi.name}`, period: label })}
      description={kpi.formula || undefined}
      form={values}
      onSubmit={(f) => save.mutate(f)}
      pending={save.isPending}
      extra={
        (entered || cell.note) && (
          <Button type="button" variant="outline" onClick={() => clear.mutate(undefined)} disabled={clear.isPending}>
            {t("kpis.clearFigure")}
          </Button>
        )
      }
    >
      {cell.from === "tickets" && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">
          {t("kpis.fromTicketsNow", { figure: showKpi(kpi.unit, cell.value, format, t) })}
          {cell.denominator !== null && ` (${t("kpis.counted", { numerator: format.number(cell.numerator!), denominator: format.number(cell.denominator) })})`}
          <Hint className="ms-1">{t("kpis.overrideHint")}</Hint>
        </p>
      )}
      {percent && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <NumberField name="numerator" label={t("kpis.numerator")} description={t("kpis.countsHint")} min={0} step={1} optional />
            <NumberField name="denominator" label={t("kpis.denominator")} min={0} step={1} optional />
          </div>
        </>
      )}
      <NumberField name="value" label={percent ? t("kpis.valuePercent") : t("kpis.value")} min={0} step={0.01} optional />
      <TextareaField name="note" label={t("kpis.note")} description={t("kpis.noteHint")} rows={3} optional />
    </FormDialog>
  );
}
