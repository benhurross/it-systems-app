"use client";

import { MoreHorizontal, PackagePlus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { AssetDialog } from "@/components/assets/asset-dialog";
import { AttachmentsButton, AttachmentsDialog } from "@/components/attachments";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { PurchaseDialog } from "@/components/finance/dialogs";
import { FinanceHeader } from "@/components/finance/finance-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { api } from "@/lib/api";
import type { Purchase } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { PURCHASE_STATUSES, ref, type PurchaseStatus } from "@/lib/domain";
import { nextPurchaseStatuses } from "@/lib/workflows";

const col = columnHelper<Purchase>();
const ACTION: Record<PurchaseStatus, "approve" | "reject" | "order" | "receive" | null> = {
  approved: "approve",
  rejected: "reject",
  ordered: "order",
  received: "receive",
  requested: null,
};

export default function PurchasesPage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [dialog, setDialog] = useState<{ kind: "new" } | { kind: "edit" | "inventory"; purchase: Purchase } | null>(null);
  const { data = [], isLoading } = useApi<Purchase[]>("/purchases");
  const { data: documents } = useApi<Record<number, number>>("/attachments/counts?entity=purchase");
  const [documentsFor, setDocumentsFor] = useState<{ id: number; name: string } | null>(null);
  const move = useApiMutation(
    async ({ purchase, status }: { purchase: Purchase; status: PurchaseStatus }) => {
      await api(`/purchases/${purchase.id}/status`, { body: { status } });
      return { purchase, status };
    },
    {
      onSuccess: ({ purchase, status }) =>
        toast.success(t("finance.purchases.moved", { ref: ref("purchase", purchase.id), status: t(`enums.purchaseStatus.${status}`) })),
    },
  );

  const columns = [
    col.accessor((p) => ref("purchase", p.id), { id: "ref", header: t("finance.purchases.ref"), cell: (info) => <span className="font-mono">{info.getValue()}</span> }),
    col.accessor("title", {
      header: t("finance.purchases.item"),
      cell: (info) => {
        const p = info.row.original;
        return (
          <div className="min-w-48">
            <p className="font-medium">{p.title}</p>
            {p.hardware && p.status === "received" && (
              <p className="text-xs text-muted-foreground">
                {t("finance.purchases.inInventory", { count: format.number(p.inInventory), quantity: format.number(p.quantity) })}
              </p>
            )}
          </div>
        );
      },
    }),
    col.accessor("category", {
      header: t("finance.purchases.category"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("budget_category", info.getValue()),
    }),
    col.accessor("vendorName", { header: t("finance.purchases.vendor"), cell: (info) => info.getValue() ?? "—" }),
    col.accessor("requestedForName", { header: t("finance.purchases.requestedFor"), cell: (info) => info.getValue() ?? "—" }),
    col.accessor("quantity", { header: t("finance.purchases.quantity"), cell: (info) => <span className="tabular-nums">{format.number(info.getValue())}</span> }),
    col.accessor("amount", { header: t("finance.purchases.amount"), cell: (info) => <span className="tabular-nums">{format.currency(info.getValue())}</span> }),
    col.accessor("status", {
      header: t("finance.purchases.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="purchaseStatus" value={info.getValue()} />,
    }),
    col.accessor("createdAt", { header: t("finance.purchases.requestedOn"), cell: (info) => format.date(info.getValue()) }),
    col.display({
      id: "documents",
      header: t("finance.documents"),
      cell: (info) => (
        <AttachmentsButton
          name={`${ref("purchase", info.row.original.id)} ${info.row.original.title}`}
          count={documents?.[info.row.original.id] ?? 0}
          onOpen={() => setDocumentsFor({ id: info.row.original.id, name: `${ref("purchase", info.row.original.id)} ${info.row.original.title}` })}
        />
      ),
    }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">{t("common.actions")}</span>,
      cell: (info) => {
        const p = info.row.original;
        const next = nextPurchaseStatuses(p.status);
        const addable = p.hardware && p.status === "received" && p.inInventory < p.quantity;
        if (next.length === 0 && !addable) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("finance.purchases.actions", { item: p.title })}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {next.map((status) => (
                <DropdownMenuItem key={status} onSelect={() => move.mutate({ purchase: p, status })}>
                  {t(`finance.purchases.${ACTION[status]!}`)}
                </DropdownMenuItem>
              ))}
              {p.status === "requested" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", purchase: p })}>{t("common.edit")}</DropdownMenuItem>
                </>
              )}
              {addable && (
                <DropdownMenuItem onSelect={() => setDialog({ kind: "inventory", purchase: p })}>
                  <PackagePlus />
                  {t("finance.purchases.addToInventory")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ];

  return (
    <>
      <FinanceHeader
        actions={
          <Button onClick={() => setDialog({ kind: "new" })}>
            <Plus />
            {t("finance.purchases.new")}
          </Button>
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        facets={[
          {
            column: "status",
            label: t("finance.purchases.status"),
            options: PURCHASE_STATUSES.map((s) => ({ value: s, label: t(`enums.purchaseStatus.${s}`) })),
          },
          { column: "category", label: t("finance.purchases.category"), options: lookups.options("budget_category") },
        ]}
        csv={{
          filename: "purchases.csv",
          columns: [
            { header: "Request", value: (p) => ref("purchase", p.id) },
            { header: "Item", value: (p) => p.title },
            { header: "Category", value: (p) => lookups.label("budget_category", p.category) },
            { header: "Vendor", value: (p) => p.vendorName },
            { header: "For", value: (p) => p.requestedForName },
            { header: "Quantity", value: (p) => p.quantity },
            { header: "Total (SAR)", value: (p) => p.amount },
            { header: "Status", value: (p) => p.status },
            { header: "Requested by", value: (p) => p.requestedByName },
            { header: "Requested", value: (p) => isoDate(p.createdAt) },
            { header: "Decided by", value: (p) => p.approvedByName },
          ],
        }}
      />
      {dialog?.kind === "new" && <PurchaseDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <PurchaseDialog purchase={dialog.purchase} onClose={() => setDialog(null)} />}
      {dialog?.kind === "inventory" && (
        <AssetDialog
          initial={{
            name: "",
            purchaseId: dialog.purchase.id,
            purchaseDate: isoDate(dialog.purchase.receivedAt ?? dialog.purchase.createdAt),
            purchaseCost: Math.round(dialog.purchase.amount / dialog.purchase.quantity),
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {documentsFor && (
        <AttachmentsDialog entity="purchase" entityId={documentsFor.id} name={documentsFor.name} onClose={() => setDocumentsFor(null)} />
      )}
    </>
  );
}
