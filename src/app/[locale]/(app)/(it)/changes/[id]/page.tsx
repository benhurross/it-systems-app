"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { EnumBadge } from "@/components/badges";
import { ChangeDialog } from "@/components/changes/change-dialog";
import { FormDialog, SelectField } from "@/components/form";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Change } from "@/lib/api-types";
import { CHANGE_RESULTS, ref, type ChangeStatus } from "@/lib/domain";
import { nextChangeStatuses } from "@/lib/workflows";

export default function ChangePage({ params }: PageProps<"/[locale]/changes/[id]">) {
  const { id } = use(params);
  const t = useTranslations();
  const format = useFormat();
  const [editing, setEditing] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const { data: change, isLoading } = useApi<Change>(`/changes/${id}`);
  const decide = useApiMutation(
    (status: ChangeStatus) => api(`/changes/${id}/decision`, { body: { status } }),
    { success: t("changes.decided") },
  );

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!change) return <StatusPage kind="notFound" home="/changes" />;

  const next = nextChangeStatuses(change.status);
  const closed = next.length === 0;

  return (
    <div className="space-y-6">
      <Link href="/changes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("changes.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-muted-foreground">{ref("change", change.id)}</span>
            <EnumBadge kind="changeStatus" value={change.status} />
            <EnumBadge kind="changeRisk" value={change.risk} />
            {change.result && <EnumBadge kind="changeResult" value={change.result} />}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{change.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {!closed && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              {t("common.edit")}
            </Button>
          )}
          {next.includes("approved") && (
            <Button onClick={() => decide.mutate("approved")} disabled={decide.isPending}>
              {t("changes.approve")}
            </Button>
          )}
          {next.includes("implemented") && <Button onClick={() => setImplementing(true)}>{t("changes.recordResult")}</Button>}
          {next.includes("rejected") && (
            <Button variant="outline" onClick={() => decide.mutate("rejected")} disabled={decide.isPending}>
              {t("changes.reject")}
            </Button>
          )}
        </div>
      </div>
      {closed && <p className="text-sm text-muted-foreground">{t("changes.closedNote")}</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {[
            [t("common.description"), change.description],
            [t("changes.reason"), change.reason],
            [t("changes.rollback"), change.rollbackPlan],
            [t("common.notes"), change.notes],
          ]
            .filter(([, body]) => body)
            .map(([title, body]) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap">{body}</CardContent>
              </Card>
            ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("tickets.details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <Row label={t("changes.asset")}>
                {change.assetId ? (
                  <Link href={`/assets/${change.assetId}`} className="text-primary hover:underline">
                    {change.assetName}
                  </Link>
                ) : (
                  "—"
                )}
              </Row>
              <Row label={t("changes.planned")}>{format.dateTime(change.plannedAt)}</Row>
              <Row label={t("changes.requestedBy")}>{change.requestedByName ?? "—"}</Row>
              <Row label={t("changes.approvedBy")}>{change.approvedByName ?? "—"}</Row>
              {change.implementedAt && <Row label={t("changes.implemented")}>{format.dateTime(change.implementedAt)}</Row>}
              {change.vendor && <Row label={t("changes.vendor")}>{change.vendor}</Row>}
              {change.ticketId && (
                <Row label={t("changes.ticket")}>
                  <Link href={`/tickets/${change.ticketId}`} className="font-mono text-primary hover:underline">
                    {ref("ticket", change.ticketId)}
                  </Link>
                </Row>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
      {editing && <ChangeDialog change={change} onClose={() => setEditing(false)} />}
      {implementing && <ResultDialog id={change.id} onClose={() => setImplementing(false)} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const resultSchema = z.object({ result: z.enum(CHANGE_RESULTS) });

function ResultDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const t = useTranslations();
  const form = useForm<z.input<typeof resultSchema>, unknown, z.output<typeof resultSchema>>({
    resolver: zodResolver(resultSchema),
    defaultValues: { result: "successful" },
  });
  const record = useApiMutation(
    ({ result }: z.output<typeof resultSchema>) => api(`/changes/${id}/decision`, { body: { status: "implemented", result } }),
    { form, success: t("changes.decided"), onSuccess: onClose },
  );
  return (
    <FormDialog open onOpenChange={onClose} title={t("changes.resultTitle")} form={form} onSubmit={(v) => record.mutate(v)} pending={record.isPending}>
      <SelectField
        name="result"
        label={t("changes.result")}
        options={CHANGE_RESULTS.map((r) => ({ value: r, label: t(`enums.changeResult.${r}`) }))}
      />
    </FormDialog>
  );
}
