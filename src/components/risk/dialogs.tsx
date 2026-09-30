"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ComboboxField, DateField, FormDialog, SelectField, TextareaField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { Asset, Risk, Staff, Vulnerability } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { RISK_STATUSES, SEVERITIES, VULN_STATUSES } from "@/lib/domain";
import { riskInput, vulnerabilityInput } from "@/lib/schemas";

export const SCALE = [1, 2, 3, 4, 5] as const;

function useOptions() {
  const { data: assets = [] } = useApi<Asset[]>("/assets");
  const { data: staff = [] } = useApi<Staff[]>("/staff");
  return {
    assets: assets.filter((a) => a.status !== "retired").map((a) => ({ value: a.id, label: a.name })),
    staff: staff.map((s) => ({ value: s.id, label: s.name })),
  };
}

export function RiskDialog({ risk, onClose }: { risk?: Risk; onClose: () => void }) {
  const t = useTranslations();
  const lookups = useLookups();
  const options = useOptions();
  const form = useForm<z.input<typeof riskInput>, unknown, z.output<typeof riskInput>>({
    resolver: zodResolver(riskInput),
    defaultValues: risk ?? { title: "", description: "", status: "open", likelihood: 3, impact: 3, assetId: null, ownerId: null },
  });
  const save = useApiMutation(
    (values: z.output<typeof riskInput>) =>
      risk ? api(`/risks/${risk.id}`, { method: "PATCH", body: values }) : api("/risks", { body: values }),
    { form, success: t("risk.saved"), onSuccess: onClose },
  );
  const scale = (kind: "likelihood" | "impact") =>
    SCALE.map((v) => ({ value: v, label: t("risk.scale", { value: String(v), label: t(`enums.${kind}.${v}`) }) }));

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={risk ? t("risk.edit") : t("risk.add")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <TextField name="title" label={t("risk.name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="category" label={t("risk.category")} options={lookups.options("risk_category")} />
        <ComboboxField name="assetId" label={t("risk.asset")} options={options.assets} optional />
        <SelectField name="likelihood" label={t("risk.likelihood")} options={scale("likelihood")} />
        <SelectField name="impact" label={t("risk.impact")} options={scale("impact")} />
      </div>
      <TextareaField name="description" label={t("risk.description")} rows={3} />
      <TextareaField name="controls" label={t("risk.controls")} rows={2} optional />
      <TextareaField name="treatment" label={t("risk.treatment")} rows={2} optional />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField name="ownerId" label={t("risk.owner")} options={options.staff} optional />
        <SelectField
          name="status"
          label={t("risk.status")}
          options={RISK_STATUSES.map((s) => ({ value: s, label: t(`enums.riskStatus.${s}`) }))}
        />
        <DateField name="reviewDate" label={t("risk.reviewDate")} optional />
      </div>
    </FormDialog>
  );
}

export function VulnerabilityDialog({ vulnerability, onClose }: { vulnerability?: Vulnerability; onClose: () => void }) {
  const t = useTranslations();
  const options = useOptions();
  const form = useForm<z.input<typeof vulnerabilityInput>, unknown, z.output<typeof vulnerabilityInput>>({
    resolver: zodResolver(vulnerabilityInput),
    defaultValues: vulnerability ?? { title: "", status: "open", detectedOn: isoDate(), assetId: null, ownerId: null },
  });
  const save = useApiMutation(
    (values: z.output<typeof vulnerabilityInput>) =>
      vulnerability
        ? api(`/vulnerabilities/${vulnerability.id}`, { method: "PATCH", body: values })
        : api("/vulnerabilities", { body: values }),
    { form, success: t("vulns.saved"), onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={vulnerability ? t("vulns.edit") : t("vulns.add")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <TextField name="title" label={t("vulns.name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="severity"
          label={t("vulns.severity")}
          options={SEVERITIES.map((s) => ({ value: s, label: t(`enums.severity.${s}`) }))}
        />
        <ComboboxField name="assetId" label={t("vulns.asset")} options={options.assets} optional />
        <DateField name="detectedOn" label={t("vulns.detectedOn")} />
        <TextField name="detectionMethod" label={t("vulns.detectionMethod")} optional />
        <DateField name="deadline" label={t("vulns.deadline")} />
        <SelectField name="ownerId" label={t("vulns.owner")} options={options.staff} optional />
        <SelectField
          name="status"
          label={t("vulns.status")}
          options={VULN_STATUSES.map((s) => ({ value: s, label: t(`enums.vulnStatus.${s}`) }))}
        />
      </div>
      <TextareaField name="description" label={t("vulns.description")} rows={3} optional />
      <TextareaField name="resolution" label={t("vulns.resolution")} rows={2} optional />
    </FormDialog>
  );
}
