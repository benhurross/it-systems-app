"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { RiskDialog } from "@/components/risk/dialogs";
import { Heatmap, type Cell } from "@/components/risk/heatmap";
import { RiskHeader } from "@/components/risk/risk-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import type { Risk } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { ref, RISK_STATUSES, SEVERITIES, type Severity } from "@/lib/domain";
import { reviewDue, riskLevel, riskScore } from "@/lib/risk";

type Row = Risk & { score: number; level: Severity };
const col = columnHelper<Row>();

export default function RiskRegisterPage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [dialog, setDialog] = useState<Risk | "new" | null>(null);
  const [cell, setCell] = useState<Cell | null>(null);
  const { data = [], isLoading } = useApi<Risk[]>("/risks");
  const today = isoDate();
  const rows: Row[] = data.map((r) => {
    const score = riskScore(r.likelihood, r.impact);
    return { ...r, score, level: riskLevel(score) };
  });
  const shown = cell ? rows.filter((r) => r.likelihood === cell.likelihood && r.impact === cell.impact) : rows;

  const columns = [
    col.accessor((r) => ref("risk", r.id), { id: "ref", header: t("risk.ref"), cell: (info) => <span className="font-mono">{info.getValue()}</span> }),
    col.accessor("title", {
      header: t("risk.name"),
      cell: (info) => (
        <button type="button" onClick={() => setDialog(info.row.original)} className="min-w-48 text-start font-medium hover:text-primary">
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("category", {
      header: t("risk.category"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("risk_category", info.getValue()),
    }),
    col.accessor("score", {
      header: t("risk.score"),
      cell: (info) => (
        <span className="whitespace-nowrap tabular-nums" dir="ltr">
          {info.row.original.likelihood} × {info.row.original.impact} = {info.getValue()}
        </span>
      ),
    }),
    col.accessor("level", {
      header: t("risk.level"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="severity" value={info.getValue()} />,
    }),
    col.accessor("ownerName", { header: t("risk.owner"), cell: (info) => info.getValue() ?? "—" }),
    col.accessor("status", {
      header: t("risk.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="riskStatus" value={info.getValue()} />,
    }),
    col.accessor("reviewDate", {
      header: t("risk.reviewDate"),
      cell: (info) =>
        info.getValue() ? (
          <span className="flex flex-wrap items-center gap-2">
            {format.date(info.getValue()!)}
            {reviewDue(info.row.original, today) && <StatusBadge tone="warning">{t("risk.reviewDue")}</StatusBadge>}
          </span>
        ) : (
          "—"
        ),
    }),
  ];

  return (
    <>
      <RiskHeader
        actions={
          <Button onClick={() => setDialog("new")}>
            <Plus />
            {t("risk.add")}
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t("risk.heatmap")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Heatmap risks={rows.filter((r) => r.status !== "closed")} selected={cell} onSelect={setCell} />
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-3">
          {cell && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {t("risk.filtered", { likelihood: String(cell.likelihood), impact: String(cell.impact) })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setCell(null)}>
                <X />
                {t("risk.showAll")}
              </Button>
            </div>
          )}
          <DataTable
            key={cell ? `${cell.likelihood}-${cell.impact}` : "all"}
            data={shown}
            columns={columns}
            loading={isLoading}
            initialSort={{ id: "score", desc: true }}
            facets={[
              {
                column: "status",
                label: t("risk.status"),
                options: RISK_STATUSES.map((s) => ({ value: s, label: t(`enums.riskStatus.${s}`) })),
              },
              {
                column: "level",
                label: t("risk.level"),
                options: SEVERITIES.map((s) => ({ value: s, label: t(`enums.severity.${s}`) })),
              },
              { column: "category", label: t("risk.category"), options: lookups.options("risk_category") },
            ]}
            csv={{
              filename: "risk-register.csv",
              columns: [
                { header: "Risk", value: (r) => ref("risk", r.id) },
                { header: "Title", value: (r) => r.title },
                { header: "Category", value: (r) => lookups.label("risk_category", r.category) },
                { header: "Affected asset", value: (r) => r.assetName },
                { header: "Likelihood", value: (r) => r.likelihood },
                { header: "Impact", value: (r) => r.impact },
                { header: "Score", value: (r) => r.score },
                { header: "Level", value: (r) => r.level },
                { header: "Current controls", value: (r) => r.controls },
                { header: "Treatment", value: (r) => r.treatment },
                { header: "Owner", value: (r) => r.ownerName },
                { header: "Status", value: (r) => r.status },
                { header: "Next review", value: (r) => r.reviewDate },
              ],
            }}
          />
        </div>
      </div>
      {dialog === "new" && <RiskDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== "new" && <RiskDialog risk={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}
