"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ComboboxField, FormDialog, SelectField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { Asset, Employee } from "@/lib/api-types";
import { ASSET_STATUSES } from "@/lib/domain";
import { assetMove } from "@/lib/schemas";
import { RoomField } from "./room-field";

/**
 * Moves an asset to another location, room or person; the server writes the movement register.
 * Its status after the move is suggested (handed to someone: in use; taken back from someone: in
 * stock) and can be changed: a meeting room's TV is in use, held by no one.
 */
export function MoveDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const t = useTranslations("assets");
  const te = useTranslations("enums.assetStatus");
  const lookups = useLookups();
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const form = useForm<z.input<typeof assetMove>, unknown, z.output<typeof assetMove>>({
    resolver: zodResolver(assetMove),
    defaultValues: { toLocation: asset.location, toRoom: asset.room, toPlanId: asset.planId, toEmployeeId: asset.assignedTo, status: asset.status, reason: "" },
  });
  // A change of person suggests the status; anything picked after stands.
  useEffect(
    () =>
      form.subscribe({
        name: "toEmployeeId",
        exact: true,
        formState: { values: true },
        callback: ({ values }) => {
          if (values.toEmployeeId) form.setValue("status", "in_use");
          else if (asset.assignedTo) form.setValue("status", "in_stock");
        },
      }),
    [form, asset.assignedTo],
  );
  const move = useApiMutation(
    (values: z.output<typeof assetMove>) => api(`/assets/${asset.id}/move`, { body: values }),
    { form, success: t("moved"), onSuccess: onClose },
  );
  return (
    <FormDialog open onOpenChange={onClose} title={t("moveTitle", { name: asset.name })} form={form} onSubmit={(v) => move.mutate(v)} pending={move.isPending}>
      <SelectField name="toLocation" label={t("moveTo")} options={lookups.options("location")} />
      <RoomField roomName="toRoom" planName="toPlanId" label={t("moveRoom")} />
      <ComboboxField
        name="toEmployeeId"
        label={t("moveToPerson")}
        options={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name }))}
        optional
      />
      <SelectField
        name="status"
        label={t("moveStatus")}
        description={t("moveStatusHint")}
        options={ASSET_STATUSES.filter((s) => s !== "retired" || asset.status === "retired").map((s) => ({ value: s, label: te(s) }))}
      />
      <TextField name="reason" label={t("reason")} />
    </FormDialog>
  );
}
