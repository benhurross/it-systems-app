"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { NumberField, SelectField, TextField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { LABEL_DPIS, LABEL_SIZES } from "@/lib/label-sizes";
import { labelPrinterSettings } from "@/lib/schemas";
import { SettingsCard } from "../settings-card";

type Setting = z.output<typeof labelPrinterSettings>;
type Preset = keyof typeof LABEL_SIZES | "custom";

export default function LabelPrinterSettings() {
  const t = useTranslations("settings.labelPrinter");
  const ts = useTranslations("settings");
  const sizeId = useId();
  const { data, isLoading } = useApi<Setting>("/settings/labelPrinter");
  const form = useForm<z.input<typeof labelPrinterSettings>, unknown, Setting>({ resolver: zodResolver(labelPrinterSettings) });
  useEffect(() => {
    if (data) form.reset(data);
  }, [data, form]);
  const save = useApiMutation((values: Setting) => api("/settings/labelPrinter", { method: "PUT", body: values }), { success: ts("saved"), form });
  const test = useApiMutation(() => api<{ ok: boolean; error?: string }>("/settings/label-printer/test", { method: "POST" }), {
    onSuccess: (result) => (result.ok ? toast.success(t("testSent")) : toast.error(t(result.error === "noPrinter" ? "testNeedsAddress" : "unreachable"))),
  });

  const [width, height] = useWatch({ control: form.control, name: ["widthMm", "heightMm"] });
  const preset = (Object.entries(LABEL_SIZES).find(([, s]) => s.widthMm === width && s.heightMm === height)?.[0] ?? "custom") as Preset;
  const choosePreset = (value: string) => {
    // Radix reports "" while the options are still arriving; that is no choice.
    if (!(value in LABEL_SIZES)) return;
    const key = value as keyof typeof LABEL_SIZES;
    form.setValue("widthMm", LABEL_SIZES[key].widthMm, { shouldDirty: true });
    form.setValue("heightMm", LABEL_SIZES[key].heightMm, { shouldDirty: true });
  };

  return (
    <div className="space-y-6">
      <SettingsCard title={t("title")} description={t("intro")} form={form} onSubmit={(v) => save.mutate(v)} pending={save.isPending} loading={isLoading}>
        <TextField name="owner" label={t("owner")} description={t("ownerHint")} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <TextField name="host" label={t("host")} description={t("hostHint")} />
          <NumberField name="port" label={t("port")} description={t("portHint")} min={1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={sizeId}>{t("size")}</Label>
          <Select value={preset} onValueChange={choosePreset}>
            <SelectTrigger id={sizeId} className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(LABEL_SIZES) as (keyof typeof LABEL_SIZES)[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`sizes.${key}`)}
                </SelectItem>
              ))}
              <SelectItem value="custom">{t("sizes.custom")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField name="widthMm" label={t("width")} min={20} />
          <NumberField name="heightMm" label={t("height")} min={10} />
        </div>
        <SelectField name="dpi" label={t("dpi")} description={t("dpiHint")} options={LABEL_DPIS.map((d) => ({ value: d, label: `${d} dpi` }))} />
      </SettingsCard>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t("testTitle")}</CardTitle>
          <CardDescription>{t("testDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => test.mutate(undefined)} disabled={test.isPending || !data?.host}>
            <Printer />
            {t("test")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
