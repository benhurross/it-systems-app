"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { DateField, FormDialog, NumberField, SelectField, TextareaField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { License, Vendor } from "@/lib/api-types";
import { LICENSE_TYPES } from "@/lib/domain";
import { licenseInput } from "@/lib/schemas";

type Input = z.input<typeof licenseInput>;
type Output = z.output<typeof licenseInput>;

export function LicenseDialog({ license, onClose }: { license?: License; onClose: () => void }) {
  const t = useTranslations();
  const lookups = useLookups();
  const router = useRouter();
  const { data: vendors = [] } = useApi<Vendor[]>("/vendors");
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(licenseInput),
    defaultValues: license ? licenseInput.parse(license) : { type: "subscription", vendorId: null, owner: "it" },
  });
  const save = useApiMutation(
    (values: Output) =>
      license
        ? api<{ id: number }>(`/licenses/${license.id}`, { method: "PATCH", body: values })
        : api<{ id: number }>("/licenses", { body: values }),
    {
      form,
      success: t("software.saved"),
      onSuccess: (saved) => {
        onClose();
        if (!license) router.push(`/software/${saved.id}`);
      },
    },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={license ? t("software.edit") : t("software.add")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <TextField name="product" label={t("software.product")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="vendorId" label={t("software.vendor")} options={vendors.map((v) => ({ value: v.id, label: v.name }))} optional />
        <TextField name="version" label={t("software.version")} optional />
        <SelectField
          name="type"
          label={t("software.type")}
          options={LICENSE_TYPES.map((v) => ({ value: v, label: t(`enums.licenseType.${v}`) }))}
        />
        <NumberField name="seats" label={t("software.seats")} min={0} step={1} />
        <DateField name="purchaseDate" label={t("software.purchaseDate")} optional />
        <DateField name="expiryDate" label={t("software.expiry")} optional />
        <NumberField name="cost" label={t("software.cost")} min={0} optional />
        <SelectField name="owner" label={t("software.owner")} options={lookups.options("department")} optional />
      </div>
      <TextField name="reference" label={t("software.reference")} description={t("software.referenceHint")} optional />
      <TextareaField name="notes" label={t("common.notes")} rows={2} optional />
    </FormDialog>
  );
}
