"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AttachmentsButton, AttachmentsDialog } from "@/components/attachments";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { ContractDialog } from "@/components/finance/dialogs";
import { FinanceHeader } from "@/components/finance/finance-header";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import type { Contract } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { ref } from "@/lib/domain";
import { CONTRACT_STATES, contractState, type ContractState } from "@/lib/finance";

type Row = Contract & { state: ContractState };
const col = columnHelper<Row>();

export default function ContractsPage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [dialog, setDialog] = useState<Contract | "new" | null>(null);
  const { data = [], isLoading } = useApi<Contract[]>("/contracts");
  const { data: documents } = useApi<Record<number, number>>("/attachments/counts?entity=contract");
  const [documentsFor, setDocumentsFor] = useState<{ id: number; name: string } | null>(null);
  const today = isoDate();
  const rows: Row[] = data.map((c) => ({ ...c, state: contractState(c, today) }));

  const columns = [
    col.accessor((c) => ref("contract", c.id), { id: "ref", header: t("finance.contracts.ref"), cell: (info) => <span className="font-mono">{info.getValue()}</span> }),
    col.accessor("title", {
      header: t("finance.contracts.name"),
      cell: (info) => (
        <button type="button" onClick={() => setDialog(info.row.original)} className="text-start font-medium hover:text-primary">
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("vendorName", { header: t("finance.contracts.vendor"), cell: (info) => info.getValue() ?? "—" }),
    col.accessor("category", {
      header: t("finance.contracts.category"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("budget_category", info.getValue()),
    }),
    col.accessor("startDate", { header: t("finance.contracts.start"), cell: (info) => format.date(info.getValue()) }),
    col.accessor("endDate", { header: t("finance.contracts.end"), cell: (info) => format.date(info.getValue()) }),
    col.accessor("annualCost", {
      header: t("finance.contracts.annualCost"),
      cell: (info) => <span className="tabular-nums">{format.currency(info.getValue())}</span>,
    }),
    col.accessor("autoRenew", {
      header: t("finance.contracts.autoRenew"),
      cell: (info) => (info.getValue() ? t("common.yes") : t("common.no")),
    }),
    col.accessor("state", {
      header: t("finance.contracts.state"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="contractState" value={info.getValue()} />,
    }),
    col.display({
      id: "documents",
      header: t("finance.documents"),
      cell: (info) => (
        <AttachmentsButton
          name={info.row.original.title}
          count={documents?.[info.row.original.id] ?? 0}
          onOpen={() => setDocumentsFor({ id: info.row.original.id, name: info.row.original.title })}
        />
      ),
    }),
  ];

  return (
    <>
      <FinanceHeader
        actions={
          <Button onClick={() => setDialog("new")}>
            <Plus />
            {t("finance.contracts.add")}
          </Button>
        }
      />
      <DataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        initialSort={{ id: "endDate", desc: false }}
        facets={[
          {
            column: "state",
            label: t("finance.contracts.state"),
            options: CONTRACT_STATES.map((s) => ({ value: s, label: t(`enums.contractState.${s}`) })),
          },
          { column: "category", label: t("finance.contracts.category"), options: lookups.options("budget_category") },
        ]}
        csv={{
          filename: "contracts.csv",
          columns: [
            { header: "Contract", value: (c) => ref("contract", c.id) },
            { header: "Title", value: (c) => c.title },
            { header: "Vendor", value: (c) => c.vendorName },
            { header: "Category", value: (c) => lookups.label("budget_category", c.category) },
            { header: "Starts", value: (c) => c.startDate },
            { header: "Ends", value: (c) => c.endDate },
            { header: "Annual cost (SAR)", value: (c) => c.annualCost },
            { header: "Renews automatically", value: (c) => (c.autoRenew ? "yes" : "no") },
            { header: "Renewal", value: (c) => c.state },
          ],
        }}
      />
      {dialog === "new" && <ContractDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== "new" && <ContractDialog contract={dialog} onClose={() => setDialog(null)} />}
      {documentsFor && (
        <AttachmentsDialog entity="contract" entityId={documentsFor.id} name={documentsFor.name} onClose={() => setDocumentsFor(null)} />
      )}
    </>
  );
}
