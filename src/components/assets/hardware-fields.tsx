"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { NumberField, SelectField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { FieldSeparator } from "@/components/ui/field";
import { profileOf, STORAGE_UNITS, type AssetSpecs } from "@/lib/asset-specs";
import { ListField } from "./list-field";

/**
 * The asset's hardware, as its type has it: a laptop's processor, memory, drives, system and screen;
 * a virtual server's virtual CPUs; a monitor's screen; nothing for software. The processor, storage
 * type and system dropdowns are lists IT can add to as they type.
 */
export function HardwareFields() {
  const t = useTranslations("assets.hardware");
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
      <ListField name={`specs.drives.${i}.type`} label={t("storageType")} list="storage_type" />
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
        {has("cpu") && <ListField name="specs.cpu" label={t("processor")} list="processor" />}
        {has("vcpus") && <NumberField name="specs.vcpus" label={t("vcpus")} min={1} step={1} optional />}
        {has("ram") && <NumberField name="specs.ramGb" label={t("ram")} min={0} optional />}
        {has("screen") && <NumberField name="specs.screenInches" label={t("screen")} min={0} optional />}
        {has("portCount") && <NumberField name="specs.portCount" label={t("portCount")} min={1} step={1} optional />}
        {has("os") && <ListField name="specs.os" label={t("os")} list="operating_system" />}
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
    </>
  );
}
