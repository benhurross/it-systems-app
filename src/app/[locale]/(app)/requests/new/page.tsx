"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PackagePlus, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Form, SelectField, TextareaField, TextField } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { ref } from "@/lib/domain";
import { ticketCreate } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Input = z.input<typeof ticketCreate>;
type Output = z.output<typeof ticketCreate>;

const KINDS = [
  { value: "incident", icon: Wrench, label: "broken", hint: "brokenHint" },
  { value: "request", icon: PackagePlus, label: "need", hint: "needHint" },
] as const;

export default function NewRequestPage() {
  const t = useTranslations();
  const lookups = useLookups();
  const router = useRouter();
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(ticketCreate),
    defaultValues: { type: "incident", subject: "", description: "" },
  });
  const send = useApiMutation((values: Output) => api<{ id: number }>("/tickets", { body: values }), {
    form,
    onSuccess: (ticket) => {
      toast.success(t("requests.sent", { ref: ref("ticket", ticket.id) }));
      router.push(`/requests/${ticket.id}`);
    },
  });

  return (
    <>
      <PageHeader title={t("requests.newTitle")} />
      <Card className="max-w-3xl">
        <Form form={form} onSubmit={(values) => send.mutate(values)}>
          <CardContent>
            <FieldGroup>
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
            </FieldGroup>
          </CardContent>
          <CardFooter className="mt-6 justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={send.isPending}>
              {t("requests.submit")}
            </Button>
          </CardFooter>
        </Form>
      </Card>
    </>
  );
}
