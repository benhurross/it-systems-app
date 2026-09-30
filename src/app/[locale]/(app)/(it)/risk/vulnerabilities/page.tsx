"use client";

import { Bug, CalendarX, Plus, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { VulnerabilityDialog } from "@/components/risk/dialogs";
import { RiskHeader } from "@/components/risk/risk-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { Vulnerability } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { ref, SEVERITIES, VULN_STATUSES } from "@/lib/domain";
import { isOverdue } from "@/lib/risk";

type Row = Vulnerability & { overdue: boolean };
const col = columnHelper<Row>();
const UNRESOLVED = new Set(["open", "in_progress"]);

export default function VulnerabilitiesPage() {
  const t = useTranslations();
  const format = useFormat();
  const [dialog, setDialog] = useState<Vulnerability | "new" | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const { data = [], isLoading } = useApi<Vulnerability[]>("/vulnerabilities");
  const today = isoDate();
  const rows: Row[] = data.map((v) => ({ ...v, overdue: isOverdue(v, today) }));
  const open = rows.filter((v) => UNRESOLVED.has(v.status));

  const columns = [
    col.accessor((v) => ref("vulnerability", v.id), {
      id: "ref",
      header: t("vulns.ref"),
      cell: (info) => <span className="font-mono">{info.getValue()}</span>,
    }),
    col.accessor("title", {
      header: t("vulns.name"),
      cell: (info) => (
        <button type="button" onClick={() => setDialog(info.row.original)} className="min-w-48 text-start font-medium hover:text-primary">
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("severity", {
      header: t("vulns.severity"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="severity" value={info.getValue()} />,
    }),
    col.accessor("assetName", {
      header: t("vulns.asset"),
      cell: (info) =>
        info.getValue() ? (
          <Link href={`/assets/${info.row.original.assetId}`} className="hover:text-primary">
            {info.getValue()}
          </Link>
        ) : (
          "—"
        ),
    }),
    col.accessor("detectedOn", { header: t("vulns.detectedOn"), cell: (info) => format.date(info.getValue()) }),
    col.accessor("deadline", {
      header: t("vulns.deadline"),
      cell: (info) => (
        <span className="flex flex-wrap items-center gap-2">
          {format.date(info.getValue())}
          {info.row.original.overdue && <StatusBadge tone="danger">{t("vulns.overdue")}</StatusBadge>}
        </span>
      ),
    }),
    col.accessor("status", {
      header: t("vulns.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="vulnStatus" value={info.getValue()} />,
    }),
    col.accessor("ownerName", { header: t("vulns.owner"), cell: (info) => info.getValue() ?? "—" }),
  ];

  return (
    <>
      <RiskHeader
        actions={
          <Button onClick={() => setDialog("new")}>
            <Plus />
            {t("vulns.add")}
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Bug} label={t("vulns.summary.open")} value={format.number(open.length)} />
        <StatCard icon={CalendarX} label={t("vulns.summary.overdue")} value={format.number(open.filter((v) => v.overdue).length)} />
        <StatCard
          icon={ShieldAlert}
          label={t("vulns.summary.serious")}
          value={format.number(open.filter((v) => v.severity === "critical" || v.severity === "high").length)}
        />
      </div>
      <DataTable
        key={String(overdueOnly)}
        data={overdueOnly ? rows.filter((v) => v.overdue) : rows}
        columns={columns}
        loading={isLoading}
        facets={[
          {
            column: "severity",
            label: t("vulns.severity"),
            options: SEVERITIES.map((s) => ({ value: s, label: t(`enums.severity.${s}`) })),
          },
          {
            column: "status",
            label: t("vulns.status"),
            options: VULN_STATUSES.map((s) => ({ value: s, label: t(`enums.vulnStatus.${s}`) })),
          },
        ]}
        toolbar={
          <div className="flex items-center gap-2">
            <Switch id="overdue-only" checked={overdueOnly} onCheckedChange={setOverdueOnly} />
            <Label htmlFor="overdue-only" className="text-sm font-normal">
              {t("vulns.overdueOnly")}
            </Label>
          </div>
        }
        csv={{
          filename: "vulnerabilities.csv",
          columns: [
            { header: "Vulnerability", value: (v) => ref("vulnerability", v.id) },
            { header: "Title", value: (v) => v.title },
            { header: "Severity", value: (v) => v.severity },
            { header: "Affected asset", value: (v) => v.assetName },
            { header: "Found on", value: (v) => v.detectedOn },
            { header: "Found by", value: (v) => v.detectionMethod },
            { header: "Fix by", value: (v) => v.deadline },
            { header: "Status", value: (v) => v.status },
            { header: "Overdue", value: (v) => (v.overdue ? "yes" : "no") },
            { header: "Resolved on", value: (v) => v.resolvedOn },
            { header: "Owner", value: (v) => v.ownerName },
          ],
        }}
      />
      {dialog === "new" && <VulnerabilityDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== "new" && <VulnerabilityDialog vulnerability={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}
