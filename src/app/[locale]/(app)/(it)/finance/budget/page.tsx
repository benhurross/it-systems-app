"use client";

import { ChevronLeft, ChevronRight, CircleAlert, Gauge, Landmark, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FinanceHeader } from "@/components/finance/finance-header";
import { BudgetDialog } from "@/components/finance/dialogs";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import type { BudgetSummary, Contract } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { contractState } from "@/lib/finance";
import { cn } from "@/lib/utils";

export default function BudgetPage() {
  const t = useTranslations("finance.budget");
  const format = useFormat();
  const lookups = useLookups();
  const [year, setYear] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ category: string; amount: number } | null>(null);
  const { data } = useApi<BudgetSummary>(year ? `/budgets?year=${year}` : "/budgets");
  const { data: contracts = [] } = useApi<Contract[]>("/contracts");
  const today = isoDate();

  const lines = (data?.lines ?? []).toSorted((a, b) => b.budget - a.budget || b.committed - a.committed);
  const budget = lines.reduce((sum, l) => sum + l.budget, 0);
  const committed = lines.reduce((sum, l) => sum + l.committed, 0);
  const renewals = contracts
    .filter((c) => contractState(c, today) === "expiring")
    .toSorted((a, b) => a.endDate.localeCompare(b.endDate));

  const switcher = data && (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label={t("previous")} onClick={() => setYear(data.fiscalYear - 1)}>
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      <div className="min-w-32 px-2 text-center">
        <p className="font-semibold">{t("year", { year: String(data.fiscalYear) })}</p>
        <p className="text-xs text-muted-foreground">{t("range", { from: format.date(data.from), to: format.date(data.to) })}</p>
      </div>
      <Button variant="outline" size="icon" aria-label={t("next")} onClick={() => setYear(data.fiscalYear + 1)}>
        <ChevronRight className="rtl:rotate-180" />
      </Button>
    </div>
  );

  return (
    <>
      <FinanceHeader actions={switcher} />
      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Landmark} label={t("total")} value={format.currency(budget)} />
            <StatCard icon={Wallet} label={t("committed")} value={format.currency(committed)} />
            <StatCard icon={Gauge} label={t("used")} value={budget ? format.percent(committed / budget) : "—"} />
            <StatCard icon={CircleAlert} label={t("overCount")} value={format.number(lines.filter((l) => l.over).length)} />
          </div>

          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("category")}</TableHead>
                    <TableHead className="text-end">{t("total")}</TableHead>
                    <TableHead className="text-end">{t("contracts")}</TableHead>
                    <TableHead className="text-end">{t("purchases")}</TableHead>
                    <TableHead className="text-end">{t("committed")}</TableHead>
                    <TableHead className="min-w-44">{t("utilisation")}</TableHead>
                    <TableHead className="text-end">{t("remaining")}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t("set")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const label = lookups.label("budget_category", line.category);
                    return (
                      <TableRow key={line.category}>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell className="text-end tabular-nums">
                          {line.budget ? format.currency(line.budget) : <span className="text-muted-foreground">{t("notSet")}</span>}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{format.currency(line.contracts)}</TableCell>
                        <TableCell className="text-end tabular-nums">{format.currency(line.purchases)}</TableCell>
                        <TableCell className="text-end font-medium tabular-nums">{format.currency(line.committed)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={Math.min(100, (line.utilisation ?? (line.committed ? 1 : 0)) * 100)}
                              className={cn(line.over && "[&>*]:bg-danger")}
                              aria-label={`${label}: ${line.utilisation === null ? "—" : format.percent(line.utilisation)}`}
                            />
                            <span className={cn("w-14 text-end text-xs tabular-nums", line.over && "font-medium text-danger")}>
                              {line.utilisation === null ? "—" : format.percent(line.utilisation)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-end tabular-nums", line.over && "text-danger")}>
                          {format.currency(line.budget - line.committed)}
                        </TableCell>
                        <TableCell className="text-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t("setFor", { category: label })}
                            onClick={() => setEditing({ category: line.category, amount: line.budget })}
                          >
                            {t("set")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("renewals")}</CardTitle>
            </CardHeader>
            <CardContent>
              {renewals.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noRenewals")}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {renewals.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                      <div className="min-w-0">
                        <p className="font-medium">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.vendorName ?? "—"} · {format.currency(c.annualCost)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {c.autoRenew && <StatusBadge tone="info">{t("autoRenews")}</StatusBadge>}
                        <StatusBadge tone="warning">{t("ends", { date: format.date(c.endDate) })}</StatusBadge>
                        <span className="text-xs text-muted-foreground">{format.relative(`${c.endDate}T00:00:00+03:00`)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {editing && data && (
        <BudgetDialog year={data.fiscalYear} category={editing.category} amount={editing.amount} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
