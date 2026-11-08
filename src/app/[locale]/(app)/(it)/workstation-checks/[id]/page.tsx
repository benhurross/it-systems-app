"use client";

import { ArrowLeft, Check, Minus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { use } from "react";
import { AttachmentsCard } from "@/components/attachments";
import { EnumBadge } from "@/components/badges";
import { DeleteRecord } from "@/components/delete-record";
import { StatusPage } from "@/components/status-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ReadState } from "@/components/workstation/read-state";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import type { WorkstationCheck } from "@/lib/api-types";
import type { WorkstationItemState } from "@/lib/domain";
import { cn } from "@/lib/utils";

const MARK: Record<WorkstationItemState, { icon: typeof Check; className: string }> = {
  ok: { icon: Check, className: "text-success" },
  not_ok: { icon: X, className: "text-destructive" },
  na: { icon: Minus, className: "text-muted-foreground" },
};

/** One check: each item as found, the word for the employee, a photo, and whether they have read it. */
export default function WorkstationCheckPage({ params }: PageProps<"/[locale]/workstation-checks/[id]">) {
  const { id } = use(params);
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormat();
  const router = useRouter();
  const { data: check, isLoading } = useApi<WorkstationCheck>(`/workstation-checks/${id}`);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!check) return <StatusPage kind="notFound" home="/workstation-checks" />;

  const facts: [string, React.ReactNode][] = [
    [t("workstation.computer"), check.assetId ? <Link href={`/assets/${check.assetId}`} className="text-primary hover:underline">{check.computerName}</Link> : check.computerName],
    [t("workstation.employee"), check.employeeId ? <Link href={`/people/directory/${check.employeeId}`} className="text-primary hover:underline">{check.employeeName}</Link> : (check.employeeName ?? t("workstation.nobody"))],
    [t("workstation.checkedBy"), `${check.checkedByName} · ${format.dateTime(check.checkedAt)}`],
    [t("workstation.read"), check.readAt ? t("workstation.readBy", { who: check.readBy ?? "", where: check.readOn === "app" ? t("workstation.inApp") : (check.readOn ?? ""), date: format.dateTime(check.readAt) }) : t("workstation.notRead")],
  ];

  return (
    <div className="space-y-6">
      <Link href="/workstation-checks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("workstation.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <EnumBadge kind="workstationResult" value={check.result} />
            <ReadState readAt={check.readAt} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("workstation.checkOf", { computer: check.computerName, date: format.date(check.checkedAt) })}</h1>
        </div>
        <DeleteRecord path={`/workstation-checks/${check.id}`} name={t("workstation.checkOf", { computer: check.computerName, date: format.date(check.checkedAt) })} onDeleted={() => router.push("/workstation-checks")} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("workstation.checklist")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {check.items.map((item) => {
                  const { icon: Icon, className } = MARK[item.state];
                  return (
                    <li key={item.code} className={cn("flex items-start gap-3 py-2.5 text-sm", item.state === "not_ok" && "font-medium")}>
                      <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
                      <span className="min-w-0 flex-1">
                        {locale === "ar" ? item.labelAr : item.labelEn}
                        {item.note && <span className="block font-normal text-muted-foreground">{item.note}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t(`workstation.states.${item.state}`)}</span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
          {check.message && (
            <Card>
              <CardHeader>
                <CardTitle>{t("workstation.message")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm" dir="auto">
                  {check.message}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <AttachmentsCard entity="workstation_check" entityId={check.id} />
        </div>
      </div>
    </div>
  );
}
