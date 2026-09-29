"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { ChangeDialog } from "@/components/changes/change-dialog";
import { columnHelper, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { Change } from "@/lib/api-types";
import { CHANGE_RISKS, CHANGE_STATUSES, ref } from "@/lib/domain";

const col = columnHelper<Change>();

export default function ChangesPage() {
  const t = useTranslations();
  const format = useFormat();
  const [creating, setCreating] = useState(false);
  const { data = [], isLoading } = useApi<Change[]>("/changes");

  const columns = [
    col.accessor((c) => ref("change", c.id), {
      id: "ref",
      header: t("changes.ref"),
      cell: (info) => (
        <Link href={`/changes/${info.row.original.id}`} className="font-mono text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("title", { header: t("changes.changeTitle") }),
    col.accessor("assetName", { header: t("changes.asset"), cell: (info) => info.getValue() ?? "" }),
    col.accessor("risk", { header: t("changes.risk"), filterFn: "arrHas", cell: (info) => <EnumBadge kind="changeRisk" value={info.getValue()} /> }),
    col.accessor("plannedAt", {
      header: t("changes.planned"),
      cell: (info) => <span className="whitespace-nowrap">{format.dateTime(info.getValue())}</span>,
    }),
    col.accessor("status", {
      header: t("changes.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="changeStatus" value={info.getValue()} />,
    }),
    col.accessor("result", {
      header: t("changes.result"),
      cell: (info) => (info.getValue() ? <EnumBadge kind="changeResult" value={info.getValue()!} /> : null),
    }),
    col.accessor("requestedByName", { header: t("changes.requestedBy"), cell: (info) => info.getValue() ?? "" }),
  ];

  return (
    <>
      <PageHeader
        title={t("changes.title")}
        description={t("changes.description")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("changes.new")}
          </Button>
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        rowHref={(c) => `/changes/${c.id}`}
        initialSort={{ id: "plannedAt", desc: true }}
        facets={[
          { column: "status", label: t("changes.status"), options: CHANGE_STATUSES.map((s) => ({ value: s, label: t(`enums.changeStatus.${s}`) })) },
          { column: "risk", label: t("changes.risk"), options: CHANGE_RISKS.map((r) => ({ value: r, label: t(`enums.changeRisk.${r}`) })) },
        ]}
      />
      {creating && <ChangeDialog onClose={() => setCreating(false)} />}
    </>
  );
}
