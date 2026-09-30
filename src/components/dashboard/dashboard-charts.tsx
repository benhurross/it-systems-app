"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import type { DashboardData } from "@/lib/api-types";
import { BarList } from "./bar-list";
import { ChartCard, ChartTable, LegendKey } from "./chart-card";
import { TicketsChart } from "./tickets-chart";

/** The dashboard's four charts. Single-series bars share the first chart colour; budget is grey context. */
export function DashboardCharts({ charts, fiscalYear }: { charts: DashboardData["charts"]; fiscalYear: number }) {
  const t = useTranslations("dashboard.charts");
  const format = useFormat();
  const lookups = useLookups();
  const empty = <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  // Category names come from the reference lists; wait for them rather than flash their codes.
  if (!lookups.ready) return <Skeleton className="h-96 w-full" />;
  const issueTypes = charts.ticketsByIssueType.map((r) => ({ ...r, label: lookups.label("issue_type", r.issueType) }));
  const categories = charts.assetsByCategory.map((r) => ({ ...r, label: lookups.label("asset_category", r.category) }));
  const budget = charts.budget
    .map((r) => ({ ...r, label: lookups.label("budget_category", r.category) }))
    .sort((a, b) => b.budget - a.budget);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <TicketsChart months={charts.ticketsByMonth} />
      </div>
      <ChartCard
        title={t("issueTypes")}
        description={t("lastYear")}
        table={<ChartTable head={[t("issueType"), t("ticketCount")]} rows={issueTypes.map((r) => [r.label, format.number(r.count)])} />}
      >
        {issueTypes.length ? (
          <BarList
            bars={[{ color: "var(--chart-1)", name: t("ticketCount") }]}
            rows={issueTypes.map((r) => ({ key: r.issueType, label: r.label, values: [r.count], display: [format.number(r.count)] }))}
          />
        ) : (
          empty
        )}
      </ChartCard>
      <ChartCard
        title={t("assets")}
        description={t("notRetired")}
        table={<ChartTable head={[t("category"), t("assetCount")]} rows={categories.map((r) => [r.label, format.number(r.count)])} />}
      >
        {categories.length ? (
          <BarList
            bars={[{ color: "var(--chart-1)", name: t("assetCount") }]}
            rows={categories.map((r) => ({ key: r.category, label: r.label, values: [r.count], display: [format.number(r.count)] }))}
          />
        ) : (
          empty
        )}
      </ChartCard>
      <div className="lg:col-span-2">
        <ChartCard
          title={t("budget")}
          description={t("fiscalYear", { year: fiscalYear })}
          legend={
            <div className="flex flex-wrap gap-4">
              <LegendKey color="var(--chart-5)" label={t("budgeted")} />
              <LegendKey color="var(--chart-1)" label={t("committed")} />
            </div>
          }
          table={
            <ChartTable
              head={[t("category"), t("budgeted"), t("committed"), t("used")]}
              rows={budget.map((r) => [
                r.label,
                format.currency(r.budget),
                format.currency(r.committed),
                r.budget > 0 ? format.percent(r.committed / r.budget) : "—",
              ])}
            />
          }
        >
          {budget.length ? (
            <BarList
              bars={[
                { color: "var(--chart-5)", name: t("budgeted") },
                { color: "var(--chart-1)", name: t("committed") },
              ]}
              rows={budget.map((r) => ({
                key: r.category,
                label: r.label,
                values: [r.budget, r.committed],
                display: [format.currency(r.budget), format.currency(r.committed)],
              }))}
            />
          ) : (
            empty
          )}
        </ChartCard>
      </div>
    </div>
  );
}
