"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormDialog, NumberField } from "@/components/form";
import { useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import type { KpiRow } from "@/lib/kpis";

const quarter = z.number().min(0).max(1_000_000).nullish();
const schema = z.object({ q1: quarter, q2: quarter, q3: quarter, q4: quarter });
type Values = z.infer<typeof schema>;

/** A year's quarterly figures for training hours or ISO non-conformities. */
export function RecordDialog({ row, year, onClose }: { row: KpiRow; year: number; onClose: () => void }) {
  const t = useTranslations();
  const [q1, q2, q3, q4] = row.quarters;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { q1, q2, q3, q4 } });
  const save = useApiMutation(
    (v: Values) =>
      api("/kpis", { method: "PUT", body: { year, kpi: row.kpi, quarters: [v.q1, v.q2, v.q3, v.q4].map((q) => q ?? null) } }),
    { form, success: t("kpis.saved"), onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("kpis.recordTitle", { kpi: t(`kpi.${row.kpi}`), year })}
      description={t("kpis.recordHint")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
    >
      <div className="grid grid-cols-2 gap-4">
        {(["q1", "q2", "q3", "q4"] as const).map((name, i) => (
          <NumberField key={name} name={name} label={t("kpis.quarter", { n: i + 1 })} min={0} step={row.kpi === "iso_ncs" ? 1 : 0.5} optional />
        ))}
      </div>
    </FormDialog>
  );
}
