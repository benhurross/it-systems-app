"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CheckDialog } from "@/components/workstation/check-dialog";
import { ReadState } from "@/components/workstation/read-state";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import type { WorkstationCheckRow } from "@/lib/api-types";
import { WORKSTATION_RESULTS } from "@/lib/domain";

const col = columnHelper<WorkstationCheckRow>();

/** IT's desk checks against the IT standard, and whether each employee has read theirs. */
export default function WorkstationChecksPage() {
  const t = useTranslations();
  const format = useFormat();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const { data = [], isLoading } = useApi<WorkstationCheckRow[]>("/workstation-checks");

  const columns = [
    col.accessor("checkedAt", {
      header: t("workstation.date"),
      cell: (info) => (
        <Link href={`/workstation-checks/${info.row.original.id}`} className="whitespace-nowrap text-primary hover:underline">
          {format.date(info.getValue())}
        </Link>
      ),
    }),
    col.accessor("computerName", { header: t("workstation.computer") }),
    col.accessor((c) => c.employeeName ?? "", { id: "employee", header: t("workstation.employee") }),
    col.accessor("result", { header: t("workstation.result"), filterFn: "arrHas", cell: (info) => <EnumBadge kind="workstationResult" value={info.getValue()} /> }),
    col.accessor("toFix", { header: t("workstation.toFix"), cell: (info) => (info.getValue() ? format.number(info.getValue()) : "—") }),
    col.accessor((c) => (c.readAt ? "read" : "unread"), { id: "read", header: t("workstation.read"), filterFn: "arrHas", cell: (info) => <ReadState readAt={info.row.original.readAt} /> }),
    col.accessor("checkedByName", { header: t("workstation.checkedBy") }),
  ];

  return (
    <>
      <PageHeader
        title={t("workstation.title")}
        description={t("workstation.description")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("workstation.new")}
          </Button>
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        rowHref={(c) => `/workstation-checks/${c.id}`}
        initialSort={{ id: "checkedAt", desc: true }}
        facets={[
          { column: "result", label: t("workstation.result"), options: WORKSTATION_RESULTS.map((r) => ({ value: r, label: t(`enums.workstationResult.${r}`) })) },
          { column: "read", label: t("workstation.read"), options: (["unread", "read"] as const).map((r) => ({ value: r, label: t(`workstation.readFilter.${r}`) })) },
        ]}
      />
      {creating && <CheckDialog onClose={() => setCreating(false)} onSaved={(id) => router.push(`/workstation-checks/${id}`)} />}
    </>
  );
}
