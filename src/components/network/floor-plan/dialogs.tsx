"use client";

import { Hint } from "@/components/hint";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { DeleteRecord } from "@/components/delete-record";
import { ComboboxField, FormDialog, NumberField, SelectField, TextareaField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import type { Asset, FloorPlan, Outlet } from "@/lib/api-types";
import { panelLabel, switchLabel } from "@/lib/floor-plan";
import { floorPlanInput, outletInput } from "@/lib/schemas";
import type { LayerRole } from "@/lib/svg-plan";

/** The assets to choose from: network devices first, the rest after, none retired. */
export function useAssetOptions() {
  const { data: assets = [] } = useApi<Asset[]>("/assets");
  return assets
    .filter((a) => a.status !== "retired")
    .toSorted((a, b) => Number(b.category === "network") - Number(a.category === "network") || a.name.localeCompare(b.name))
    .map((a) => ({ value: a.id, label: a.name }));
}

/** How an outlet is named: its two labels, P5-18 / S4-42. */
export const outletName = (o: Parameters<typeof panelLabel>[0] & Parameters<typeof switchLabel>[0]) => [panelLabel(o), switchLabel(o)].filter(Boolean).join(" / ");

/** An outlet's ports, room, device and note; a new one is placed where the plan was clicked. */
export function OutletDialog({
  plan,
  outlet,
  at,
  onClose,
  onSaved,
}: {
  plan: FloorPlan;
  outlet?: Outlet;
  at?: { x: number; y: number };
  onClose: () => void;
  onSaved?: (id: number) => void;
}) {
  const t = useTranslations("floorPlan");
  const assets = useAssetOptions();
  const form = useForm<z.input<typeof outletInput>, unknown, z.output<typeof outletInput>>({
    resolver: zodResolver(outletInput),
    defaultValues: outlet
      ? { panel: outlet.panel, panelPort: outlet.panelPort, switchNo: outlet.switchNo, switchPort: outlet.switchPort, x: outlet.x, y: outlet.y, room: outlet.room, assetId: outlet.assetId, note: outlet.note }
      : { panel: null, panelPort: null, switchNo: null, switchPort: null, x: at?.x ?? 0.5, y: at?.y ?? 0.5, room: "", assetId: null, note: "" },
  });
  const save = useApiMutation(
    (values: z.output<typeof outletInput>) =>
      outlet ? api<{ id: number }>(`/outlets/${outlet.id}`, { method: "PATCH", body: values }) : api<{ id: number }>(`/floor-plans/${plan.id}/outlets`, { body: values }),
    {
      form,
      success: t("outletDialog.saved"),
      onSuccess: (saved) => {
        onSaved?.(saved.id);
        onClose();
      },
    },
  );
  const label = outlet ? outletName(outlet) || t("unlabelled") : "";

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={outlet ? t("outletDialog.edit", { label }) : t("outletDialog.add")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      extra={outlet && <DeleteRecord path={`/outlets/${outlet.id}`} name={t("outletDialog.deleteName", { label })} onDeleted={onClose} />}
    >
      <div className="grid grid-cols-2 gap-4">
        <NumberField name="panel" label={t("panel")} min={0} step={1} optional />
        <NumberField name="panelPort" label={t("panelPort")} min={0} step={1} optional />
        <NumberField name="switchNo" label={t("switchNo")} min={0} step={1} optional />
        <NumberField name="switchPort" label={t("switchPort")} min={0} step={1} optional />
      </div>
      <TextField name="room" label={t("room")} optional />
      <ComboboxField name="assetId" label={t("device")} options={assets} optional />
      <TextareaField name="note" label={t("note")} optional rows={2} />
    </FormDialog>
  );
}

type Settings = { name: string; devices: Record<string, number | null>; roles: Record<string, LayerRole> };

/**
 * The plan's name, which device each switch number on it is, and for a plan in 3D, how each of
 * its drawing's layers shows: raised as walls, as glass, or flat on the floor.
 */
export function PlanSettingsDialog({ plan, roles, onClose }: { plan: FloorPlan; roles: Record<string, LayerRole> | null; onClose: () => void }) {
  const t = useTranslations("floorPlan");
  const assets = useAssetOptions();
  const layers = Object.keys(roles ?? {});
  const form = useForm<Settings>({
    defaultValues: {
      name: plan.name,
      devices: Object.fromEntries(plan.switches.map((s) => [`s${s.number}`, s.asset?.id ?? null])),
      // By position: layer names may hold anything, and form paths take letters and digits.
      roles: Object.fromEntries(layers.map((l, i) => [`l${i}`, roles![l]])),
    },
  });
  const save = useApiMutation(
    (values: Settings) => {
      const switches = Object.fromEntries(
        Object.entries(values.devices).flatMap(([key, id]) => (id ? [[key.slice(1), id]] : [])),
      );
      const chosen = roles ? { layers: Object.fromEntries(layers.map((l, i) => [l, values.roles[`l${i}`]])) } : {};
      return api(`/floor-plans/${plan.id}`, { method: "PATCH", body: floorPlanInput.parse({ name: values.name, switches, ...chosen }) });
    },
    { success: t("settingsDialog.saved"), onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("settingsDialog.title")}
      description={t("settingsDialog.intro")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      extra={<DeleteRecord path={`/floor-plans/${plan.id}`} name={plan.name} detail={t("deleteDetail", { count: plan.outlets.length })} onDeleted={onClose} />}
    >
      <TextField name="name" label={t("uploadDialog.name")} />
      {plan.switches.map((s) => (
        // Keys stay letters first: react-hook-form takes a number in a path as an array's index.
        <ComboboxField key={s.number} name={`devices.s${s.number}`} label={t("settingsDialog.switchDevice", { number: s.number })} options={assets} optional />
      ))}
      {layers.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-1 flex items-center gap-1 text-sm font-medium">
            {t("settingsDialog.layers")}
            <Hint>{t("settingsDialog.layersHint")}</Hint>
          </legend>
          {layers.map((l, i) => (
            <SelectField
              key={l}
              name={`roles.l${i}`}
              label={l}
              options={(["wall", "glass", "flat"] as const).map((r) => ({ value: r, label: t(`settingsDialog.roles.${r}`) }))}
            />
          ))}
        </fieldset>
      )}
    </FormDialog>
  );
}
