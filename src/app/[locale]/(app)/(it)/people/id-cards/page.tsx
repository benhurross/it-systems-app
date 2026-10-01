"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { NewCardDialog } from "@/components/id-cards/new-card-dialog";
import { PeopleHeader } from "@/components/people/people-header";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { IdCard } from "@/lib/api-types";
import { ID_CARD_REASONS, ID_CARD_STATUSES, ref } from "@/lib/domain";

const col = columnHelper<IdCard>();

/** Cards asked for by employees, started for joiners or by IT, and the ones already printed. */
export default function IdCardsPage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [adding, setAdding] = useState(false);
  const { data = [], isLoading } = useApi<IdCard[]>("/id-cards");

  const columns = [
    col.accessor("personName", {
      header: t("idCards.person"),
      cell: (info) => (
        <Link href={`/people/id-cards/${info.row.original.id}`} className="font-medium hover:text-primary">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("department", {
      header: t("people.department"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("department", info.getValue()),
    }),
    col.accessor("reason", {
      header: t("idCards.reason"),
      filterFn: "arrHas",
      cell: (info) => t(`enums.idCardReason.${info.getValue()}`),
    }),
    col.accessor("ticketId", {
      header: t("idCards.request"),
      cell: (info) => {
        const id = info.getValue();
        return id ? (
          <Link href={`/tickets/${id}`} className="font-mono hover:text-primary">
            {ref("ticket", id)}
          </Link>
        ) : (
          "—"
        );
      },
    }),
    col.accessor("status", {
      header: t("idCards.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="idCardStatus" value={info.getValue()} />,
    }),
    col.accessor("createdAt", { header: t("idCards.requestedOn"), cell: (info) => format.date(info.getValue()) }),
    col.accessor("printedAt", { header: t("idCards.printedOn"), cell: (info) => (info.getValue() ? format.date(info.getValue()!) : "—") }),
  ];

  return (
    <>
      <PeopleHeader
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("idCards.new")}
          </Button>
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        facets={[
          { column: "status", label: t("idCards.status"), options: ID_CARD_STATUSES.map((s) => ({ value: s, label: t(`enums.idCardStatus.${s}`) })) },
          { column: "reason", label: t("idCards.reason"), options: ID_CARD_REASONS.map((r) => ({ value: r, label: t(`enums.idCardReason.${r}`) })) },
          { column: "department", label: t("people.department"), options: lookups.options("department") },
        ]}
      />
      {adding && <NewCardDialog onClose={() => setAdding(false)} />}
    </>
  );
}
