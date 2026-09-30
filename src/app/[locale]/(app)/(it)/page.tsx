"use client";

import { Activity, AppWindow, Boxes, Clock, Gauge, ShieldAlert, Ticket, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import type { DashboardData } from "@/lib/api-types";
import { RECENT_DAYS } from "@/lib/dashboard";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const format = useFormat();
  const user = useCurrentUser();
  const { data } = useApi<DashboardData>("/dashboard");
  const percent = (ratio: number | null) => (ratio === null ? "—" : format.percent(ratio));

  return (
    <>
      <PageHeader title={t("title")} description={t("welcome", { name: user.name })} />
      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Ticket}
              label={t("tiles.openTickets")}
              value={format.number(data.tiles.openTickets)}
              hint={t("tiles.breached", { count: format.number(data.tiles.breached) })}
              href="/tickets"
            />
            <StatCard
              icon={Gauge}
              label={t("tiles.slaCompliance")}
              value={percent(data.tiles.slaCompliance)}
              hint={t("tiles.lastDays", { days: RECENT_DAYS })}
              href="/kpis"
            />
            <StatCard
              icon={Clock}
              label={t("tiles.averageResolution")}
              value={data.tiles.averageResolutionHours === null ? "—" : format.hours(data.tiles.averageResolutionHours)}
              hint={t("tiles.lastDays", { days: RECENT_DAYS })}
            />
            <StatCard
              icon={Activity}
              label={t("tiles.availability")}
              value={percent(data.tiles.availability)}
              hint={t("tiles.devicesDown", { count: format.number(data.tiles.devicesDown) })}
              href="/network"
            />
            <StatCard
              icon={Boxes}
              label={t("tiles.assetsInUse")}
              value={format.number(data.tiles.assetsInUse)}
              hint={t("tiles.assetsOf", { count: format.number(data.tiles.assets) })}
              href="/assets/inventory"
            />
            <StatCard icon={AppWindow} label={t("tiles.licenseCompliance")} value={percent(data.tiles.licenseCompliance)} href="/software" />
            <StatCard
              icon={Wallet}
              label={t("tiles.budgetUtilisation")}
              value={percent(data.tiles.budgetUtilisation)}
              hint={t("tiles.fiscalYear", { year: data.tiles.fiscalYear })}
              href="/finance/budget"
            />
            <StatCard
              icon={ShieldAlert}
              label={t("tiles.openHighRisks")}
              value={format.number(data.tiles.openHighRisks)}
              hint={t("tiles.highOrCritical")}
              href="/risk/register"
            />
          </div>
          <AttentionPanel groups={data.attention} />
        </>
      )}
    </>
  );
}
