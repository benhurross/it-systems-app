"use client";

import { Download, Info, Pencil, Plus, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useMemo, useState } from "react";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge } from "@/components/badges";
import { FigureDialog } from "@/components/kpis/figure-dialog";
import { ImportDialog } from "@/components/kpis/import-dialog";
import { KpiDialog } from "@/components/kpis/kpi-dialog";
import { showKpi } from "@/components/kpis/show";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import type { KpiRegister, KpiRow } from "@/lib/api-types";
import type { KpiCell } from "@/lib/kpi-register";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const thisYear = new Date().getFullYear();
const ALL = "all";
const MINE = "mine";

export default function KpisPage() {
  const t = useTranslations();
  const format = useFormat();
  const locale = useLocale();
  const user = useCurrentUser();
  const admin = can(user.role, "settings");
  const [year, setYear] = useState(thisYear);
  const [view, setView] = useState(ALL);
  const [editing, setEditing] = useState<KpiRow | "new" | null>(null);
  const [recording, setRecording] = useState<{ kpi: KpiRow; cell: KpiCell; label: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const { data } = useApi<KpiRegister>(`/kpis?year=${year}`);

  const months = useMemo(() => {
    const name = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, m) => name.format(new Date(Date.UTC(2026, m, 1))));
  }, [locale]);
  const monthName = useMemo(() => {
    const name = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
    return (m: number) => name.format(new Date(Date.UTC(year, m - 1, 1)));
  }, [locale, year]);
  const periodLabel = (kpi: KpiRow, p: number) => (kpi.period === "month" ? monthName(p) : t("kpis.quarterOf", { n: p, year }));
  const nameOf = (kpi: KpiRow) => (locale === "ar" && kpi.nameAr ? kpi.nameAr : kpi.name);
  const show = (kpi: KpiRow, v: number | null) => showKpi(kpi.unit, v, format, t);

  // The register's roles in order, each with its KPIs and score; "My KPIs" or one role when chosen.
  const groups = useMemo(() => {
    if (!data) return [];
    const rows = data.rows.filter((r) => r.active && (view === ALL || (view === MINE ? r.ownerId === user.id : r.role === view)));
    const roles = [...new Set(rows.map((r) => r.role))];
    return roles.map((role) => ({ role, rows: rows.filter((r) => r.role === role), score: data.roles.find((s) => s.role === role) }));
  }, [data, view, user.id]);
  const roleNames = data ? [...new Set(data.rows.filter((r) => r.active).map((r) => r.role))] : [];
  const inactive = data?.rows.filter((r) => !r.active) ?? [];

  const head = "px-2 py-2 text-start text-xs font-medium text-muted-foreground whitespace-nowrap";
  const cell = "px-2 py-2 tabular-nums whitespace-nowrap";

  return (
    <>
      <PageHeader
        title={t("kpis.title")}
        description={t("kpis.intro")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/kpis/export?year=${year}`} download>
                <Download />
                {t("kpis.export")}
              </a>
            </Button>
            {admin && (
              <>
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <Upload />
                  {t("kpis.importRegister")}
                </Button>
                <Button onClick={() => setEditing("new")}>
                  <Plus />
                  {t("kpis.addKpi")}
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <Label htmlFor="kpi-year">{t("kpis.year")}</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger id="kpi-year" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <Label htmlFor="kpi-view">{t("kpis.show")}</Label>
          <Select value={view} onValueChange={setView}>
            <SelectTrigger id="kpi-view" className="w-56 min-w-0 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("kpis.allKpis")}</SelectItem>
              <SelectItem value={MINE}>{t("kpis.myKpis")}</SelectItem>
              {roleNames.filter(Boolean).map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-80 w-full" />
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">{t("kpis.none")}</p>
      ) : (
        <div className="space-y-6">
          {groups.map(({ role, rows, score }) => (
            <Card key={role || "—"} className="gap-0 overflow-hidden py-0">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b py-4">
                <CardTitle>
                  <h2 className="text-base font-semibold">{role || t(`kpis.levels.${rows[0].level}`)}</h2>
                  <span className="text-sm font-normal text-muted-foreground">
                    {[t(`kpis.levels.${rows[0].level}`), ...new Set(rows.map((r) => r.ownerName).filter(Boolean))].join(" · ")}
                  </span>
                </CardTitle>
                {score && score.total > 0 && (
                  <StatusBadge tone={score.score === null ? "neutral" : score.score >= 0.95 ? "success" : score.score >= 0.8 ? "warning" : "danger"}>
                    {score.score === null
                      ? t("kpis.noScore")
                      : t("kpis.score", { score: format.number(score.score, { style: "percent", maximumFractionDigits: 1 }), weighted: format.number(score.weighted / 100, { style: "percent" }) })}
                  </StatusBadge>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[80rem] text-sm">
                    <thead className="border-b bg-muted/40">
                      <tr>
                        <th scope="col" className={cn(head, "sticky start-0 z-10 bg-muted px-3")}>
                          {t("kpis.kpi")}
                        </th>
                        <th scope="col" className={head}>
                          {t("kpis.baseline")}
                        </th>
                        <th scope="col" className={head}>
                          {t("kpis.target")}
                        </th>
                        <th scope="col" className={head}>
                          {t("kpis.weightShort")}
                        </th>
                        {months.map((m) => (
                          <th key={m} scope="col" className={head}>
                            {m}
                          </th>
                        ))}
                        <th scope="col" className={head}>
                          {t("kpis.yearToDate")}
                        </th>
                        <th scope="col" className={head}>
                          {t("kpis.status")}
                        </th>
                        {admin && (
                          <th scope="col" className={head}>
                            <span className="sr-only">{t("common.actions")}</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((kpi) => (
                        <tr key={kpi.id}>
                          <th scope="row" className="sticky start-0 z-10 min-w-64 max-w-80 bg-card px-3 py-2 text-start font-normal">
                            <span className="flex items-start gap-1">
                              <span className="min-w-0">
                                <span className="block font-mono text-xs text-muted-foreground" dir="ltr">
                                  {kpi.code}
                                </span>
                                <span className="block font-medium whitespace-normal" dir="auto">
                                  {nameOf(kpi)}
                                </span>
                                <span className="block text-xs text-muted-foreground">{kpi.source === "manual" ? t("kpis.entered") : t("kpis.fromTickets")}</span>
                              </span>
                              <KpiInfo kpi={kpi} />
                            </span>
                          </th>
                          <td className={cn(cell, "text-muted-foreground")} title={kpi.settings.baselineNote || undefined}>
                            {kpi.settings.baseline === null ? t("kpis.noBaseline") : show(kpi, kpi.settings.baseline)}
                          </td>
                          <td className={cell}>
                            {show(kpi, kpi.settings.target)}
                            {kpi.targetFor === "year" && <span className="block text-xs text-muted-foreground">{t("kpis.perYear")}</span>}
                          </td>
                          <td className={cn(cell, "text-muted-foreground")}>{kpi.settings.weight === null ? "—" : `${format.number(kpi.settings.weight)}%`}</td>
                          {kpi.cells.map((c) => (
                            <td key={c.period} colSpan={kpi.period === "quarter" ? 3 : 1} className={cn("px-1 py-1", kpi.period === "quarter" && "text-center")}>
                              <Figure
                                kpi={kpi}
                                cell={c}
                                text={c.value === null ? "—" : show(kpi, c.value)}
                                label={`${nameOf(kpi)}, ${periodLabel(kpi, c.period)}`}
                                onOpen={() => setRecording({ kpi, cell: c, label: periodLabel(kpi, c.period) })}
                              />
                            </td>
                          ))}
                          <td className={cn(cell, "font-medium")}>{show(kpi, kpi.year)}</td>
                          <td className="px-2 py-2">
                            <EnumBadge kind="rag" value={kpi.status} />
                          </td>
                          {admin && (
                            <td className="px-2 py-2 text-end">
                              <Button variant="ghost" size="icon" aria-label={t("kpis.editKpi", { code: kpi.code })} onClick={() => setEditing(kpi)}>
                                <Pencil />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("kpis.statusNote")}</p>
      {admin && inactive.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("kpis.inactive")}{" "}
          {inactive.map((k, i) => (
            <Fragment key={k.id}>
              {i > 0 && ", "}
              <button type="button" className="underline hover:text-foreground" onClick={() => setEditing(k)}>
                {k.code}
              </button>
            </Fragment>
          ))}
        </p>
      )}
      {editing && <KpiDialog kpi={editing === "new" ? undefined : editing} year={year} onClose={() => setEditing(null)} />}
      {recording && <FigureDialog kpi={recording.kpi} cell={recording.cell} year={year} label={recording.label} onClose={() => setRecording(null)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} onLoaded={setYear} />}
    </>
  );
}

/** One month's or quarter's figure: opens for recording once the period has begun; marks a note. */
function Figure({ kpi, cell, text, label, onOpen }: { kpi: KpiRow; cell: KpiCell; text: string; label: string; onOpen: () => void }) {
  const t = useTranslations("kpis");
  if (!cell.started && cell.from === null) return <span className="block px-1 text-muted-foreground/50">·</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={cell.note || undefined}
      aria-label={`${label}: ${text}${cell.from === "tickets" ? `, ${t("fromTickets")}` : ""}${cell.note ? `. ${cell.note}` : ""}`}
      className={cn(
        "relative w-full rounded-md px-1 py-1.5 tabular-nums hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        cell.value === null && "text-muted-foreground",
        cell.from === "tickets" && "italic",
        kpi.period === "quarter" ? "text-center" : "text-start",
      )}
    >
      {text}
      {cell.note && <span aria-hidden className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-primary" />}
    </button>
  );
}

/** What a KPI measures, how, from where, and who reviews it. */
function KpiInfo({ kpi }: { kpi: KpiRow }) {
  const t = useTranslations("kpis");
  const facts: [string, string][] = [
    [t("definition"), kpi.definition],
    [t("formula"), kpi.formula],
    [t("frequency"), kpi.frequency],
    [t("dataSource"), kpi.dataSource],
    [t("reviewer"), kpi.reviewer],
    [t("baselineNote"), kpi.settings.baselineNote],
    [t("redFlag"), kpi.redFlag],
    [t("notes"), kpi.notes],
  ];
  const shown = facts.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("about", { code: kpi.code })}>
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[90vw]" align="start">
        <dl className="space-y-2 text-sm">
          {shown.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-line" dir="auto">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
