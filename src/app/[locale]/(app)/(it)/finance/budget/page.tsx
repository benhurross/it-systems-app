"use client";

import { Gauge, PiggyBank, Receipt, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { columnHelper, DataTable } from "@/components/data-table";
import { FinanceHeader } from "@/components/finance/finance-header";
import { RenewalsPanel } from "@/components/finance/renewals-panel";
import { StatCard } from "@/components/stat-card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import type { BudgetSummary, Contract } from "@/lib/api-types";
import { cn } from "@/lib/utils";

type Row = BudgetSummary["lines"][number] & { label: string; remaining: number };
const col = columnHelper<Row>();

export default function BudgetPage() {
  const t = useTranslations("finance.budget");
  const format = useFormat();
  const lookups = useLookups();
  const [year, setYear] = useState<number>();
  // Without a year the API answers for the current fiscal year, which anchors the picker.
  const { data: current } = useApi<BudgetSummary>("/budgets");
  const { data, isLoading } = useApi<BudgetSummary>(year ? `/budgets?year=${year}` : "/budgets");
  const { data: contracts = [] } = useApi<Contract[]>("/contracts");

  const rows: Row[] = (data?.lines ?? [])
    .map((l) => ({ ...l, label: lookups.label("budget_category", l.category), remaining: l.budget - l.committed }))
    .sort((a, b) => b.budget - a.budget);
  const budget = rows.reduce((sum, l) => sum + l.budget, 0);
  const committed = rows.reduce((sum, l) => sum + l.committed, 0);
  const over = rows.filter((l) => l.over).length;
  const fiscalYear = data?.fiscalYear ?? current?.fiscalYear;

  const money = (value: number) => <span className="tabular-nums">{format.currency(value)}</span>;
  const columns = [
    col.accessor("label", { header: t("category"), cell: (info) => <span className="font-medium">{info.getValue()}</span> }),
    col.accessor("budget", { header: t("allocated"), cell: (info) => money(info.getValue()) }),
    col.accessor("contracts", { header: t("contracts"), cell: (info) => money(info.getValue()) }),
    col.accessor("purchases", { header: t("purchases"), cell: (info) => money(info.getValue()) }),
    col.accessor("committed", { header: t("committed"), cell: (info) => money(info.getValue()) }),
    col.accessor((l) => l.utilisation ?? -1, {
      id: "utilisation",
      header: t("utilisation"),
      cell: (info) => {
        const l = info.row.original;
        if (l.utilisation === null) return <span className="text-muted-foreground">{t("notBudgeted")}</span>;
        return (
          <div className="flex min-w-36 items-center gap-2">
            <Progress
              value={Math.min(100, l.utilisation * 100)}
              className={l.over ? "[&>*]:bg-danger" : undefined}
              aria-label={format.percent(l.utilisation)}
            />
            <span className={cn("text-xs tabular-nums", l.over && "text-danger")}>{format.percent(l.utilisation)}</span>
          </div>
        );
      },
    }),
    col.accessor("remaining", {
      header: t("remaining"),
      cell: (info) => <span className={cn("tabular-nums", info.getValue() < 0 && "text-danger")}>{format.currency(info.getValue())}</span>,
    }),
  ];

  return (
    <>
      <FinanceHeader />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Label htmlFor="budget-year">{t("year")}</Label>
        {current && fiscalYear !== undefined && (
          <Select value={String(fiscalYear)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger id="budget-year" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[current.fiscalYear - 1, current.fiscalYear, current.fiscalYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {t("fy", { year: y })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {data && (
          <span className="text-sm text-muted-foreground">
            {t("range", { from: format.date(data.from), to: format.date(data.to) })}
          </span>
        )}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={PiggyBank} label={t("summary.budget")} value={format.currency(budget)} />
        <StatCard
          icon={Receipt}
          label={t("summary.committed")}
          value={format.currency(committed)}
          hint={t("summary.split", {
            contracts: format.currency(rows.reduce((sum, l) => sum + l.contracts, 0)),
            purchases: format.currency(rows.reduce((sum, l) => sum + l.purchases, 0)),
          })}
        />
        <StatCard icon={Wallet} label={t("summary.remaining")} value={format.currency(budget - committed)} />
        <StatCard
          icon={Gauge}
          label={t("summary.utilisation")}
          value={budget > 0 ? format.percent(committed / budget) : "—"}
          hint={t("summary.over", { count: format.number(over) })}
        />
      </div>
      <div className="space-y-6">
        <DataTable
          data={rows}
          columns={columns}
          loading={isLoading}
          csv={{
            filename: `budget-FY${fiscalYear ?? ""}.csv`,
            columns: [
              { header: "Category", value: (l) => l.label },
              { header: "Budget", value: (l) => l.budget },
              { header: "Contracts", value: (l) => l.contracts },
              { header: "Purchases", value: (l) => l.purchases },
              { header: "Committed", value: (l) => l.committed },
              { header: "Remaining", value: (l) => l.remaining },
              { header: "Utilisation", value: (l) => (l.utilisation === null ? "" : Math.round(l.utilisation * 1000) / 10) },
            ],
          }}
        />
        <RenewalsPanel contracts={contracts} />
      </div>
    </>
  );
}
