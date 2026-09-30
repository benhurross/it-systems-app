"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { RecordDialog } from "@/components/kpis/record-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import type { KpiReport } from "@/lib/api-types";
import { MANUAL_KPIS, type KpiKey } from "@/lib/domain";
import { quarterOf, type KpiRow } from "@/lib/kpis";

const thisYear = quarterOf(new Date()).year;

export default function KpisPage() {
  const t = useTranslations();
  const format = useFormat();
  const [year, setYear] = useState(thisYear);
  const [recording, setRecording] = useState<KpiRow | null>(null);
  const { data } = useApi<KpiReport>(`/kpis?year=${year}`);

  const show = (kpi: KpiKey, value: number | null) => {
    if (value === null) return <span className="text-muted-foreground">—</span>;
    if (kpi === "tat") return format.percent(value);
    if (kpi === "satisfaction") return t("kpis.outOf", { value: format.number(value, { maximumFractionDigits: 1 }) });
    return format.number(value, { maximumFractionDigits: 1 });
  };
  const manual = (kpi: KpiKey) => (MANUAL_KPIS as readonly string[]).includes(kpi);
  const head = "px-3 py-2 text-start text-xs font-medium text-muted-foreground";
  const cell = "px-3 py-3 tabular-nums";

  return (
    <>
      <PageHeader title={t("kpis.title")} description={t("kpis.intro")} />
      <div className="mb-6 flex items-center gap-3">
        <Label htmlFor="kpi-year">{t("kpis.year")}</Label>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger id="kpi-year" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!data ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th scope="col" className={head}>
                    {t("kpis.kpi")}
                  </th>
                  <th scope="col" className={head}>
                    {t("kpis.baseline")}
                  </th>
                  <th scope="col" className={head}>
                    {t("kpis.target")}
                  </th>
                  {[1, 2, 3, 4].map((n) => (
                    <th key={n} scope="col" className={head}>
                      {t("kpis.quarter", { n })}
                    </th>
                  ))}
                  <th scope="col" className={head}>
                    {t("kpis.yearToDate")}
                  </th>
                  <th scope="col" className={head}>
                    {t("kpis.status")}
                  </th>
                  <th scope="col" className={head}>
                    <span className="sr-only">{t("common.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((row) => (
                  <tr key={row.kpi}>
                    <th scope="row" className="px-3 py-3 text-start font-normal">
                      <span className="block font-medium">{t(`kpi.${row.kpi}`)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {manual(row.kpi) ? t("kpis.entered") : t("kpis.fromTickets")}
                      </span>
                    </th>
                    <td className={`${cell} text-muted-foreground`}>{show(row.kpi, row.baseline)}</td>
                    <td className={cell}>{show(row.kpi, row.target)}</td>
                    {row.quarters.map((value, i) => (
                      <td key={i} className={cell}>
                        {show(row.kpi, value)}
                      </td>
                    ))}
                    <td className={`${cell} font-medium`}>{show(row.kpi, row.year)}</td>
                    <td className="px-3 py-3">
                      <EnumBadge kind="rag" value={row.status} />
                    </td>
                    <td className="px-3 py-3 text-end">
                      {manual(row.kpi) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("kpis.record", { kpi: t(`kpi.${row.kpi}`), year: data.year })}
                          onClick={() => setRecording(row)}
                        >
                          <Pencil />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("kpis.note")}</p>
      {recording && data && <RecordDialog row={recording} year={data.year} onClose={() => setRecording(null)} />}
    </>
  );
}
