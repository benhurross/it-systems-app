"use client";

import { AppWindow, CalendarClock, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { LicenseDialog } from "@/components/software/license-dialog";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { License } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { LICENSE_TYPES, ref } from "@/lib/domain";
import { compliance, LICENSE_STATES, licenseState, type LicenseState } from "@/lib/licenses";

type Row = License & { state: LicenseState };
const col = columnHelper<Row>();

export default function SoftwarePage() {
  const t = useTranslations();
  const format = useFormat();
  const [adding, setAdding] = useState(false);
  const { data = [], isLoading } = useApi<License[]>("/licenses");
  const today = isoDate();
  const rows: Row[] = data.map((l) => ({ ...l, state: licenseState(l, l.installs, today) }));
  const states = rows.map((r) => r.state);
  const ratio = compliance(states);

  const columns = [
    col.accessor((l) => ref("license", l.id), {
      id: "ref",
      header: t("software.ref"),
      cell: (info) => (
        <Link href={`/software/${info.row.original.id}`} className="font-mono text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("product", { header: t("software.product"), cell: (info) => <span className="font-medium">{info.getValue()}</span> }),
    col.accessor("vendorName", { header: t("software.vendor"), cell: (info) => info.getValue() ?? "" }),
    col.accessor("type", { header: t("software.type"), filterFn: "arrHas", cell: (info) => t(`enums.licenseType.${info.getValue()}`) }),
    col.accessor((l) => (l.seats ? l.installs / l.seats : 0), {
      id: "usage",
      header: t("software.usage"),
      cell: (info) => {
        const l = info.row.original;
        return (
          <div className="flex min-w-36 items-center gap-2">
            <Progress
              value={Math.min(100, (l.installs / Math.max(1, l.seats)) * 100)}
              className={l.installs > l.seats ? "[&>*]:bg-danger" : undefined}
              aria-label={`${l.installs} / ${l.seats}`}
            />
            <span className="whitespace-nowrap text-xs tabular-nums" dir="ltr">
              {format.number(l.installs)} / {format.number(l.seats)}
            </span>
          </div>
        );
      },
    }),
    col.accessor("expiryDate", {
      header: t("software.expiry"),
      cell: (info) => (info.getValue() ? format.date(info.getValue()!) : <span className="text-muted-foreground">{t("software.noExpiry")}</span>),
    }),
    col.accessor("state", { header: t("software.state"), filterFn: "arrHas", cell: (info) => <EnumBadge kind="licenseState" value={info.getValue()} /> }),
  ];

  return (
    <>
      <PageHeader
        title={t("software.title")}
        description={t("software.intro")}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("software.add")}
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={AppWindow} label={t("software.summary.total")} value={format.number(rows.length)} />
        <StatCard icon={ShieldCheck} label={t("software.summary.compliance")} value={ratio === null ? "—" : format.percent(ratio)} />
        <StatCard icon={CalendarClock} label={t("software.summary.expiring")} value={format.number(states.filter((s) => s === "expiring").length)} />
        <StatCard
          icon={TriangleAlert}
          label={t("software.summary.atRisk")}
          value={format.number(states.filter((s) => s === "expired" || s === "over_deployed").length)}
        />
      </div>
      <DataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        rowHref={(l) => `/software/${l.id}`}
        facets={[
          { column: "state", label: t("software.state"), options: LICENSE_STATES.map((s) => ({ value: s, label: t(`enums.licenseState.${s}`) })) },
          { column: "type", label: t("software.type"), options: LICENSE_TYPES.map((s) => ({ value: s, label: t(`enums.licenseType.${s}`) })) },
        ]}
        csv={{
          label: t("software.auditReport"),
          filename: `licence-audit-${today}.csv`,
          columns: [
            { header: "Licence", value: (l) => ref("license", l.id) },
            { header: "Product", value: (l) => l.product },
            { header: "Vendor", value: (l) => l.vendorName },
            { header: "Version", value: (l) => l.version },
            { header: "Type", value: (l) => l.type },
            { header: "Seats bought", value: (l) => l.seats },
            { header: "Installed", value: (l) => l.installs },
            { header: "Purchased", value: (l) => l.purchaseDate },
            { header: "Expires", value: (l) => l.expiryDate },
            { header: "Compliance", value: (l) => l.state },
            { header: "Key location", value: (l) => l.reference },
          ],
        }}
      />
      {adding && <LicenseDialog onClose={() => setAdding(false)} />}
    </>
  );
}
