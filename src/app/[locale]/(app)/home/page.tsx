"use client";

import { CheckCircle2, Clock, IdCard, Inbox, Laptop, Plus, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { MyIdCard } from "@/components/id-cards/my-card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { MySummary } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { ref } from "@/lib/domain";
import { RECENT_CLOSED_DAYS } from "@/lib/self-service";

/** A person's own start page: their requests at a glance and the devices assigned to them. */
export default function HomePage() {
  const t = useTranslations("home");
  const tr = useTranslations("requests");
  const user = useCurrentUser();
  const format = useFormat();
  const lookups = useLookups();
  const { data } = useApi<MySummary>("/me");
  const today = isoDate(new Date());

  const newRequest = (
    <>
      <Button asChild variant="outline">
        <Link href="/requests/id-card">
          <IdCard />
          {t("idCard")}
        </Link>
      </Button>
      <Button asChild>
        <Link href="/requests/new">
          <Plus />
          {tr("new")}
        </Link>
      </Button>
    </>
  );

  if (!data || !lookups.ready) {
    return (
      <>
        <PageHeader title={t("title")} description={t("welcome", { name: user.name })} actions={newRequest} />
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  if (!data.linked) {
    return (
      <>
        <PageHeader title={t("title")} description={t("welcome", { name: user.name })} />
        <EmptyState icon={UserX} title={t("notLinked")} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("welcome", { name: user.name })} actions={newRequest} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Inbox} label={t("open")} value={format.number(data.summary.open)} hint={t("openHint")} href="/requests" />
        <StatCard icon={Clock} label={t("awaiting")} value={format.number(data.summary.awaiting)} hint={t("awaitingHint")} href="/requests" />
        <StatCard
          icon={CheckCircle2}
          label={t("closed")}
          value={format.number(data.summary.closedRecently)}
          hint={t("closedHint", { days: RECENT_CLOSED_DAYS })}
        />
      </div>

      <MyIdCard />
      {data.awaiting.length > 0 && (
        <Card className="mb-6 border-warning/50">
          <CardHeader>
            <CardTitle>{t("confirmTitle")}</CardTitle>
            <CardDescription>{t("confirmText")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {data.awaiting.map((ticket) => (
                <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                  <Link href={`/requests/${ticket.id}`} className="min-w-0 break-words hover:text-primary">
                    <span className="font-mono text-muted-foreground">{ref("ticket", ticket.id)}</span> {ticket.subject}
                  </Link>
                  {ticket.resolvedAt && <span className="text-xs text-muted-foreground">{format.relative(ticket.resolvedAt)}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("latest")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.latest.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRequests")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.latest.map((ticket) => (
                  <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <Link href={`/requests/${ticket.id}`} className="min-w-0 break-words hover:text-primary">
                      <span className="font-mono text-muted-foreground">{ref("ticket", ticket.id)}</span> {ticket.subject}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{format.date(ticket.createdAt)}</span>
                      <EnumBadge kind="ticketStatus" value={ticket.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          {data.latest.length > 0 && (
            <CardFooter>
              <Button asChild variant="outline" size="sm">
                <Link href="/requests">{t("allRequests")}</Link>
              </Button>
            </CardFooter>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("devices")}</CardTitle>
            <CardDescription>{t("devicesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.assets.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDevices")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.assets.map((asset) => {
                  const product = [asset.manufacturer, asset.model].filter(Boolean).join(" ");
                  const ended = asset.warrantyEnd !== null && asset.warrantyEnd < today;
                  return (
                    <li key={asset.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 py-3">
                      <div className="flex min-w-0 gap-3">
                        <Laptop className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium break-words">
                            {asset.name} · {lookups.label("asset_type", asset.type)}
                          </p>
                          {product && <p className="break-words text-muted-foreground">{product}</p>}
                          <p className="text-xs text-muted-foreground">
                            {asset.serial && (
                              <>
                                {t("serial")}: <span dir="ltr">{asset.serial}</span> ·{" "}
                              </>
                            )}
                            {asset.warrantyEnd === null ? (
                              t("noWarranty")
                            ) : ended ? (
                              <span className="text-warning">{t("warrantyEnded", { date: format.date(asset.warrantyEnd) })}</span>
                            ) : (
                              `${t("warranty")}: ${format.date(asset.warrantyEnd)}`
                            )}
                          </p>
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm" className="shrink-0">
                        <Link href={`/requests/new?asset=${asset.id}`} aria-label={t("reportFor", { device: asset.name })}>
                          {t("report")}
                        </Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
