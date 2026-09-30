"use client";

import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/hooks/use-format";
import type { Contract } from "@/lib/api-types";
import { daysBetween, isoDate } from "@/lib/dates";
import { contractState, RENEWAL_WINDOW_DAYS } from "@/lib/finance";

/** Contracts ending within the renewal window, soonest first. */
export function RenewalsPanel({ contracts }: { contracts: Contract[] }) {
  const t = useTranslations("finance.renewals");
  const format = useFormat();
  const today = isoDate();
  const due = contracts
    .filter((c) => contractState(c, today) === "expiring")
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          {t("title", { days: RENEWAL_WINDOW_DAYS })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("title", { days: RENEWAL_WINDOW_DAYS })}>
            {due.map((contract) => (
              <li key={contract.id} className="space-y-1 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{contract.title}</p>
                    {contract.vendorName && <p className="truncate text-xs text-muted-foreground">{contract.vendorName}</p>}
                  </div>
                  {contract.autoRenew && <StatusBadge tone="info">{t("autoRenew")}</StatusBadge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("ends", { date: format.date(contract.endDate), days: daysBetween(today, contract.endDate) })}
                </p>
                <p className="text-sm tabular-nums">{t("perYear", { amount: format.currency(contract.annualCost) })}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
