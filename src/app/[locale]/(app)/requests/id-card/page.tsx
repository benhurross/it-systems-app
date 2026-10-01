"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { IdCard, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { Form, SelectField, TextareaField } from "@/components/form";
import { designUrl, useCardLines } from "@/components/id-cards/card-face";
import { ArrangeOnCard, PhotoInput, usePhotoArranger, usePhotoError } from "@/components/id-cards/photo-arranger";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api";
import type { MyCardRequest } from "@/lib/api-types";
import { ID_CARD_REASONS, ref } from "@/lib/domain";
import { idCardRequest } from "@/lib/schemas";

type Input = z.input<typeof idCardRequest>;
type Output = z.output<typeof idCardRequest>;

/** An employee asking for a new ID card: their photo, placed on the card, and why they need it. */
export default function IdCardRequestPage() {
  const t = useTranslations();
  const format = useFormat();
  const { data, error, isLoading } = useApi<MyCardRequest>("/id-cards/request");

  if (isLoading) {
    return (
      <>
        <PageHeader title={t("idCards.requestTitle")} />
        <Skeleton className="h-96 max-w-4xl" />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title={t("idCards.requestTitle")} />
        <EmptyState icon={UserX} title={error instanceof ApiError && error.status === 403 ? t("home.notLinked") : t("errors.generic")} />
      </>
    );
  }
  if (data.waiting) {
    return (
      <>
        <PageHeader title={t("idCards.requestTitle")} />
        <Alert className="max-w-2xl">
          <IdCard />
          <AlertTitle>{t("idCards.waitingTitle")}</AlertTitle>
          <AlertDescription>
            <p>{t("idCards.waitingText", { date: format.date(data.waiting.createdAt) })}</p>
            {data.waiting.ticketId && (
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href={`/requests/${data.waiting.ticketId}`}>{t("idCards.viewRequest", { ref: ref("ticket", data.waiting.ticketId) })}</Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </>
    );
  }
  return <RequestForm data={data} />;
}

function RequestForm({ data }: { data: MyCardRequest }) {
  const t = useTranslations();
  const router = useRouter();
  const arranger = usePhotoArranger();
  const explain = usePhotoError();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const lines = useCardLines({ ...data.details, nameFont: "auto", nameSize: null, designationFont: "auto", designationSize: null });
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(idCardRequest), defaultValues: { note: "" } });

  const send = useMutation({
    mutationFn: async (values: Output) => {
      const body = new FormData();
      body.set("photo", await arranger.save(), "photo.jpg");
      body.set("reason", values.reason);
      if (values.note) body.set("note", values.note);
      const res = await fetch("/api/id-cards/request", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? "");
      return json as { id: number; ticketId: number };
    },
    onSuccess: ({ ticketId }) => {
      toast.success(t("idCards.sent", { ref: ref("ticket", ticketId) }));
      router.push(`/requests/${ticketId}`);
    },
    onError: (e) => setPhotoError(explain(e.message)),
  });

  const details = [
    { label: t("idCards.name"), value: data.details.name },
    { label: t("idCards.designation"), value: data.details.designation },
    { label: t("idCards.number"), value: data.details.number ?? "—" },
  ];

  return (
    <>
      <PageHeader title={t("idCards.requestTitle")} description={t("idCards.requestIntro")} />
      <div className="grid max-w-4xl items-start gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-72">
          <ArrangeOnCard arranger={arranger} design={designUrl(data.design, "front")} lines={lines} label={t("idCards.previewLabel", { name: data.details.name })} />
        </div>
        <Card>
          <Form
            form={form}
            // The header sits inside the form, so the form spaces the card's parts itself.
            className="flex flex-col gap-6"
            onSubmit={(values) => {
              if (!arranger.source) return setPhotoError(t("idCards.errors.fileEmpty"));
              send.mutate(values);
            }}
          >
            <CardHeader>
              <CardTitle>{t("idCards.yourCard")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <PhotoInput arranger={arranger} error={photoError} onError={setPhotoError} />
                <div className="space-y-2">
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
                    {details.map((d) => (
                      <div key={d.label} className="contents">
                        <dt className="text-muted-foreground">{d.label}</dt>
                        <dd className="font-medium break-words" dir="ltr">
                          {d.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-muted-foreground">{t("idCards.detailsHint")}</p>
                </div>
                <SelectField
                  name="reason"
                  label={t("idCards.reason")}
                  options={ID_CARD_REASONS.map((r) => ({ value: r, label: t(`enums.idCardReason.${r}`) }))}
                />
                <TextareaField name="note" label={t("idCards.note")} rows={3} optional />
              </FieldGroup>
            </CardContent>
            <CardFooter className="flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={send.isPending}>
                {t("idCards.send")}
              </Button>
            </CardFooter>
          </Form>
        </Card>
      </div>
    </>
  );
}
