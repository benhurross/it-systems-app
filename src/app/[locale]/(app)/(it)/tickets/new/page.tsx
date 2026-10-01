"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { ComboboxField, Form, SelectField, TextareaField, TextField } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Asset, Employee, Staff } from "@/lib/api-types";
import { PRIORITIES, ref, TICKET_TYPES } from "@/lib/domain";
import { ticketCreate } from "@/lib/schemas";

type Input = z.input<typeof ticketCreate>;
type Output = z.output<typeof ticketCreate>;

export default function NewTicketPage() {
  // The form reads ?type= to open as an incident report, which needs a Suspense boundary.
  return (
    <Suspense>
      <NewTicketForm />
    </Suspense>
  );
}

function NewTicketForm() {
  const t = useTranslations();
  const lookups = useLookups();
  const router = useRouter();
  const incident = useSearchParams().get("type") === "incident";
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const { data: staff = [] } = useApi<Staff[]>("/staff");
  const { data: assets = [] } = useApi<Asset[]>("/assets");

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(ticketCreate),
    defaultValues: {
      type: incident ? "incident" : "request",
      priority: incident ? "high" : "medium",
      subject: "",
      description: "",
      requesterId: null,
      assigneeId: null,
      assetId: null,
    },
  });
  const create = useApiMutation((values: Output) => api<{ id: number }>("/tickets", { body: values }), {
    form,
    onSuccess: (ticket) => {
      toast.success(t("tickets.created_toast", { ref: ref("ticket", ticket.id) }));
      router.push(`/tickets/${ticket.id}`);
    },
  });

  // A ticket usually happens where the person asking works; staff can still change it.
  const requesterId = useWatch({ control: form.control, name: "requesterId" });
  useEffect(() => {
    const person = employees.find((e) => e.id === requesterId);
    if (person) form.setValue("location", person.location);
  }, [requesterId, employees, form]);

  return (
    <>
      <PageHeader title={incident ? t("tickets.reportIncident") : t("tickets.new")} />
      <Card className="max-w-3xl">
        <Form form={form} onSubmit={(values) => create.mutate(values)}>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <ComboboxField
                  name="requesterId"
                  label={t("tickets.requester")}
                  options={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name }))}
                />
                <SelectField
                  name="type"
                  label={t("tickets.type")}
                  options={TICKET_TYPES.map((v) => ({ value: v, label: t(`enums.ticketType.${v}`) }))}
                />
                <SelectField name="issueType" label={t("tickets.issueType")} options={lookups.options("issue_type")} />
                <SelectField name="location" label={t("tickets.location")} options={lookups.options("location")} />
                <SelectField name="channel" label={t("tickets.channel")} options={lookups.options("channel")} optional />
                <SelectField
                  name="priority"
                  label={t("tickets.priority")}
                  options={PRIORITIES.map((v) => ({ value: v, label: t(`enums.priority.${v}`) }))}
                />
                <SelectField
                  name="assigneeId"
                  label={t("tickets.assignee")}
                  options={staff.map((s) => ({ value: s.id, label: s.name }))}
                  optional
                />
              </div>
              <ComboboxField
                name="assetId"
                label={t("tickets.asset")}
                options={assets.filter((a) => a.status !== "retired").map((a) => ({ value: a.id, label: `${ref("asset", a.id)} ${a.name}${a.assignedName ? ` (${a.assignedName})` : ""}` }))}
                optional
              />
              <TextField name="subject" label={t("tickets.subject")} />
              <TextareaField name="description" label={t("tickets.descriptionLabel")} rows={6} />
            </FieldGroup>
          </CardContent>
          <CardFooter className="mt-6 justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t("tickets.create")}
            </Button>
          </CardFooter>
        </Form>
      </Card>
    </>
  );
}
