"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { NumberField, SelectField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldSeparator } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useLookups } from "@/hooks/use-lookups";
import { processorOptions, profileOf, STORAGE_TYPES, STORAGE_UNITS, type AssetSpecs, type CpuBrand, type Port } from "@/lib/asset-specs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * The asset's hardware, as its type has it: a laptop's processor, memory, drives, ports, system and
 * screen; a virtual server's virtual CPUs; a monitor's screen and ports; nothing for software.
 */
export function HardwareFields() {
  const t = useTranslations("assets.hardware");
  const lookups = useLookups();
  const { control } = useFormContext();
  const [type, category, drives] = useWatch({ control, name: ["type", "category", "specs.drives"] }) as [string, string, AssetSpecs["drives"] | undefined];
  const profile = profileOf(type, category);
  const has = (f: (typeof profile.fields)[number]) => profile.fields.includes(f);
  // The second drive's row shows once added, or when one is recorded.
  const [secondDrive, setSecondDrive] = useState(() => !!(drives?.[1]?.size || drives?.[1]?.type));
  const { setValue } = useFormContext();
  const removeSecond = () => {
    setValue("specs.drives.1", { size: null, unit: "GB", type: "" });
    setSecondDrive(false);
  };
  if (!profile.fields.length) return null;

  const drive = (i: number) => (
    <div key={i} className="grid gap-4 sm:col-span-2 sm:grid-cols-[1fr_6rem_1.4fr_auto] sm:items-end">
      <NumberField name={`specs.drives.${i}.size`} label={t(i === 0 ? "storageSize" : "storageSize2")} min={0} optional />
      <SelectField name={`specs.drives.${i}.unit`} label={t("unit")} options={STORAGE_UNITS.map((u) => ({ value: u, label: u }))} />
      <SelectField name={`specs.drives.${i}.type`} label={t("storageType")} options={STORAGE_TYPES.map((v) => ({ value: v, label: t(`storageTypes.${v}`) }))} optional />
      {i === 1 && (
        <Button type="button" variant="ghost" size="icon" className="mb-0.5" aria-label={t("removeDrive")} onClick={removeSecond}>
          <X />
        </Button>
      )}
    </div>
  );

  return (
    <>
      <FieldSeparator>{t("title")}</FieldSeparator>
      <div className="grid gap-4 sm:grid-cols-2">
        {has("cpu") && <ProcessorField />}
        {has("vcpus") && <NumberField name="specs.vcpus" label={t("vcpus")} min={1} step={1} optional />}
        {has("ram") && <NumberField name="specs.ramGb" label={t("ram")} min={0} optional />}
        {has("screen") && <NumberField name="specs.screenInches" label={t("screen")} min={0} optional />}
        {has("portCount") && <NumberField name="specs.portCount" label={t("portCount")} min={1} step={1} optional />}
        {has("os") && <SelectField name="specs.os" label={t("os")} options={lookups.options("operating_system")} optional />}
        {has("storage") && (
          <>
            {drive(0)}
            {profile.drives > 1 &&
              (secondDrive ? (
                drive(1)
              ) : (
                <Button type="button" variant="outline" size="sm" className="w-fit sm:col-span-2" onClick={() => setSecondDrive(true)}>
                  <Plus />
                  {t("addDrive")}
                </Button>
              ))}
          </>
        )}
      </div>
      {has("ports") && profile.ports.length > 0 && <Ports ports={profile.ports} />}
    </>
  );
}

function Ports({ ports }: { ports: readonly Port[] }) {
  const t = useTranslations("assets.hardware");
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name="specs.ports"
      render={({ field }) => {
        const chosen: Port[] = field.value ?? [];
        return (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("ports")}</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {ports.map((p) => (
                <span key={p} className="inline-flex items-center gap-2">
                  <Checkbox id={`port-${p}`} checked={chosen.includes(p)} onCheckedChange={(v) => field.onChange(v === true ? [...chosen, p] : chosen.filter((c) => c !== p))} />
                  <Label htmlFor={`port-${p}`} className="text-sm font-normal">
                    {t(`portNames.${p}`)}
                  </Label>
                </span>
              ))}
            </div>
          </fieldset>
        );
      }}
    />
  );
}

/** One list of processors, "Intel Core i5" or "Apple M2", from each brand's list in Settings → Lists. */
function ProcessorField() {
  const t = useTranslations("assets.hardware");
  const tc = useTranslations("common");
  const lookups = useLookups();
  const { control, setValue } = useFormContext();
  const [brand, family] = useWatch({ control, name: ["specs.cpuBrand", "specs.cpuFamily"] }) as [CpuBrand | "", string];
  const options = processorOptions(lookups);
  const id = "processor";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {t("processor")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
      </Label>
      <Select
        value={brand && family ? `${brand}:${family}` : NONE}
        onValueChange={(v) => {
          const [b, f] = v === NONE ? ["", ""] : v.split(":");
          setValue("specs.cpuBrand", b, { shouldDirty: true });
          setValue("specs.cpuFamily", f, { shouldDirty: true });
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{tc("none")}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const NONE = "__none";
