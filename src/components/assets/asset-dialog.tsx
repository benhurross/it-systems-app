"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import {
  ComboboxField,
  DateField,
  FormDialog,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/form";
import { FieldSeparator } from "@/components/ui/field";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Asset, Employee } from "@/lib/api-types";
import {
  ASSET_STATUSES,
  CRITICALITIES,
  MONITOR_METHODS,
  SUPPORT_STATUSES,
} from "@/lib/domain";
import { assetInput } from "@/lib/schemas";
import { assetSpecs, PROFILES, profileOf } from "@/lib/asset-specs";
import { HardwareFields } from "./hardware-fields";

export type AssetInput = z.output<typeof assetInput>;

/** The editable fields of an asset row, ready to send back: the schema drops the rest. */
export const toAssetInput = (asset: Asset): AssetInput =>
  assetInput.parse(asset);

const BLANK: Partial<AssetInput> = {
  status: "in_stock",
  supportStatus: "supported",
  criticality: "medium",
  monitorMethod: "none",
  assignedTo: null,
  purchaseId: null,
};

/** Both drive rows ready in the form, in GB unless recorded otherwise; empty ones are not kept. */
function withDrives<T extends Partial<AssetInput>>(values: T): T {
  const drives = values.specs?.drives ?? [];
  const blank = { size: null, unit: "GB" as const, type: "" as const };
  return {
    ...values,
    specs: {
      ...assetSpecs.parse(values.specs ?? {}),
      drives: [drives[0] ?? blank, drives[1] ?? blank],
    },
  };
}

/** Registers a new asset, possibly from a discovery or a purchase (`initial`), or edits `asset`. */
export function AssetDialog({
  asset,
  initial,
  onClose,
}: {
  asset?: Asset;
  initial?: Partial<AssetInput>;
  onClose: () => void;
}) {
  const t = useTranslations();
  const lookups = useLookups();
  const router = useRouter();
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const form = useForm<z.input<typeof assetInput>, unknown, AssetInput>({
    resolver: zodResolver(assetInput),
    defaultValues: withDrives(
      asset ? toAssetInput(asset) : { ...BLANK, ...initial },
    ),
  });
  const [method, type, category, osText, osChosen] = useWatch({
    control: form.control,
    name: ["monitorMethod", "type", "category", "os", "specs.os"],
  });
  // Remote support (AnyDesk) is for the computers people and servers use.
  const remote = ["laptop", "desktop", "server", "virtual"].some(
    (p) => profileOf(type, category) === PROFILES[p as keyof typeof PROFILES],
  );
  const save = useApiMutation(
    (values: AssetInput) =>
      asset
        ? api<{ id: number }>(`/assets/${asset.id}`, {
            method: "PATCH",
            body: values,
          })
        : api<{ id: number }>("/assets", { body: values }),
    {
      form,
      success: t("assets.saved"),
      onSuccess: (saved) => {
        onClose();
        if (!asset) router.push(`/assets/${saved.id}`);
      },
    },
  );
  const options = (
    kind: "assetStatus" | "supportStatus" | "criticality" | "monitorMethod",
    values: readonly string[],
  ) =>
    values.map((v) => ({
      value: v,
      label: t(`enums.${kind}.${v}` as "enums.assetStatus.in_use"),
    }));

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={asset ? t("assets.edit") : t("assets.add")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label={t("assets.nameField")} />
        <SelectField
          name="status"
          label={t("assets.status")}
          options={options("assetStatus", ASSET_STATUSES)}
        />
        <SelectField
          name="category"
          label={t("assets.category")}
          options={lookups.options("asset_category")}
        />
        <SelectField
          name="type"
          label={t("assets.type")}
          options={lookups.options("asset_type")}
        />
        <SelectField
          name="manufacturer"
          label={t("assets.manufacturer")}
          options={lookups.options("manufacturer")}
          optional
        />
        <TextField name="model" label={t("assets.model")} optional />
        <TextField
          name="serial"
          label={t("assets.serial")}
          dir="ltr"
          optional
        />
        <SelectField
          name="location"
          label={t("assets.location")}
          options={lookups.options("location")}
        />
        <ComboboxField
          name="assignedTo"
          label={t("assets.assignedTo")}
          options={employees
            .filter((e) => e.active)
            .map((e) => ({ value: e.id, label: e.name }))}
          optional
        />
        <SelectField
          name="criticality"
          label={t("assets.criticality")}
          options={options("criticality", CRITICALITIES)}
        />
      </div>
      <HardwareFields />
      <FieldSeparator>{t("assets.lifecycle")}</FieldSeparator>
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          name="purchaseDate"
          label={t("assets.purchaseDate")}
          optional
        />
        <NumberField
          name="purchaseCost"
          label={t("assets.purchaseCost")}
          min={0}
          optional
        />
        <DateField
          name="warrantyEnd"
          label={t("assets.warrantyEnd")}
          optional
        />
        <SelectField
          name="supportStatus"
          label={t("assets.supportStatus")}
          options={options("supportStatus", SUPPORT_STATUSES)}
        />
      </div>
      {/* A screen is not on the network: nothing to monitor. */}
      {type !== "monitor" && (
        <>
          <FieldSeparator>{t("assets.monitoring")}</FieldSeparator>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="ipAddress"
              label={t("assets.ipAddress")}
              dir="ltr"
              optional
            />
            <TextField
              name="macAddress"
              label={t("assets.macAddress")}
              dir="ltr"
              optional
            />
            {remote && (
              <TextField
                name="anydeskId"
                label={t("assets.anydeskId")}
                description={t("assets.anydeskHint")}
                dir="ltr"
                optional
              />
            )}
            <SelectField
              name="monitorMethod"
              label={t("assets.monitorMethod")}
              options={options("monitorMethod", MONITOR_METHODS)}
            />
            {method === "tcp" && (
              <NumberField
                name="monitorPort"
                label={t("assets.monitorPort")}
                min={1}
                step={1}
              />
            )}
            {/* Where the hardware section has no system to choose, it is written here. */}
            {/* So is a system recorded as text before the list, until one is chosen from it. */}
            {(!profileOf(type, category).fields.includes("os") ||
              (!osChosen && !!osText)) && (
              <TextField name="os" label={t("assets.os")} optional />
            )}
          </div>
        </>
      )}
      <TextareaField name="notes" label={t("assets.notes")} rows={2} optional />
    </FormDialog>
  );
}
