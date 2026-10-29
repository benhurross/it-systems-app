"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Laptop, PackagePlus, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { FormDialog, SelectField, TextareaField, TextField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { MySummary } from "@/lib/api-types";
import { ref } from "@/lib/domain";
import { ticketCreate } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Input = z.input<typeof ticketCreate>;
type Output = z.output<typeof ticketCreate>;
export type MyDevice = Extract<MySummary, { linked: true }>["assets"][number];

const KINDS = [
  { value: "incident", icon: Wrench, label: "broken", hint: "brokenHint" },
  { value: "request", icon: PackagePlus, label: "need", hint: "needHint" },
] as const;

/** Someone asks IT for help, about one of their devices or not; the request opens once it is sent. */
export function NewRequestDialog({ device: about, onClose }: { device?: MyDevice; onClose: () => void }) {
  const t = useTranslations();
  const lookups = useLookups();
  const router = useRouter();
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(ticketCreate),
    // A request about a device starts at the device's location.
    defaultValues: { type: "incident", subject: "", description: "", assetId: about?.id ?? null, location: about?.location },
  });
  const assetId = useWatch({ control: form.control, name: "assetId" });
  const device = about && assetId === about.id ? about : undefined;
  const send = useApiMutation((values: Output) => api<{ id: number }>("/tickets", { body: values }), {
    form,
    onSuccess: (ticket) => {
      toast.success(t("requests.sent", { ref: ref("ticket", ticket.id) }));
      onClose();
      router.push(`/requests/${ticket.id}`);
    },
  });

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("requests.newTitle")}
      form={form}
      onSubmit={(values) => send.mutate(values)}
      submitLabel={t("requests.submit")}
      pending={send.isPending}
      wide
    >
      {device && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Laptop className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 break-words">
              <span className="text-muted-foreground">{t("requests.device")}:</span>{" "}
              <span className="font-medium">
                {device.name} · {lookups.label("asset_type", device.type)}
              </span>
            </span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => form.setValue("assetId", null)}>
            {t("requests.removeDevice")}
          </Button>
        </div>
      )}
      <FieldSet>
        <FieldLegend>{t("requests.kind")}</FieldLegend>
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-2">
              {KINDS.map((kind) => (
                <label
                  key={kind.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    field.value === kind.value ? "border-primary bg-brand-soft" : "hover:bg-muted",
                  )}
                >
                  <RadioGroupItem value={kind.value} className="mt-1" />
                  <kind.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span>
                    <span className="block font-medium">{t(`requests.${kind.label}`)}</span>
                    <span className="block text-sm text-muted-foreground">{t(`requests.${kind.hint}`)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          )}
        />
      </FieldSet>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="issueType" label={t("tickets.issueType")} options={lookups.options("issue_type")} />
        <SelectField name="location" label={t("tickets.location")} options={lookups.options("location")} />
      </div>
      <TextField name="subject" label={t("tickets.subject")} />
      <TextareaField name="description" label={t("tickets.descriptionLabel")} rows={6} />
    </FormDialog>
  );
}
