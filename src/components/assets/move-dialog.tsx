"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ComboboxField, FormDialog, SelectField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { Asset, Employee } from "@/lib/api-types";
import { assetMove } from "@/lib/schemas";

/** Moves an asset to another location or person; the server writes the movement register. */
export function MoveDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const t = useTranslations("assets");
  const lookups = useLookups();
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const form = useForm<z.input<typeof assetMove>, unknown, z.output<typeof assetMove>>({
    resolver: zodResolver(assetMove),
    defaultValues: { toLocation: asset.location, toEmployeeId: asset.assignedTo, reason: "" },
  });
  const move = useApiMutation(
    (values: z.output<typeof assetMove>) => api(`/assets/${asset.id}/move`, { body: values }),
    { form, success: t("moved"), onSuccess: onClose },
  );
  return (
    <FormDialog open onOpenChange={onClose} title={t("moveTitle", { name: asset.name })} form={form} onSubmit={(v) => move.mutate(v)} pending={move.isPending}>
      <SelectField name="toLocation" label={t("moveTo")} options={lookups.options("location")} />
      <ComboboxField
        name="toEmployeeId"
        label={t("moveToPerson")}
        options={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name }))}
        optional
      />
      <TextField name="reason" label={t("reason")} />
    </FormDialog>
  );
}
