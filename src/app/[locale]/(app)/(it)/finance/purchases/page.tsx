"use client";

import { CircleCheck, Hourglass, MoreHorizontal, PackageCheck, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AssetDialog, type AssetInput } from "@/components/assets/asset-dialog";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { FinanceHeader } from "@/components/finance/finance-header";
import { PurchaseDialog } from "@/components/finance/purchase-dialog";
import { StatCard } from "@/components/stat-card";
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

/** The menu label for moving a purchase on to each status. */
const STEP: Partial<Record<PurchaseStatus, "approve" | "reject" | "markOrdered" | "markReceived">> = {
  approved: "approve",
  rejected: "reject",
  ordered: "markOrdered",
  received: "markReceived",
};

export default function PurchasesPage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [editing, setEditing] = useState<Purchase | "new" | null>(null);
  const [receiving, setReceiving] = useState<Purchase | null>(null);
  const { data = [], isLoading } = useApi<Purchase[]>("/purchases");
  const move = useApiMutation(
    ({ id, status }: { id: number; status: PurchaseStatus }) => api(`/purchases/${id}/status`, { body: { status } }),
    { success: t("finance.purchases.updated") },
  );

  const total = (rows: Purchase[]) => format.currency(rows.reduce((sum, p) => sum + p.amount, 0));
  const awaiting = data.filter((p) => p.status === "requested");
  const onOrder = data.filter((p) => p.status === "approved" || p.status === "ordered");
  const year = isoDate().slice(0, 4);
  const received = data.filter((p) => p.status === "received" && p.receivedAt && isoDate(p.receivedAt).startsWith(year));

  const toAsset = (p: Purchase): Partial<AssetInput> => ({
    purchaseId: p.id,
    purchaseDate: p.receivedAt ? isoDate(p.receivedAt) : null,
    purchaseCost: Math.round((p.amount / p.quantity) * 100) / 100,
    assignedTo: p.requestedFor,
    status: p.requestedFor ? "in_use" : "in_stock",
    notes: t("finance.purchases.fromPurchase", { ref: ref("purchase", p.id), title: p.title }),
  });

  const columns = [
    col.accessor((p) => ref("purchase", p.id), {
      id: "ref",
      header: t("finance.purchases.ref"),
      cell: (info) => <span className="font-mono text-muted-foreground">{info.getValue()}</span>,
    }),
    col.accessor("title", {
      header: t("finance.purchases.item"),
      cell: (info) => {
        const p = info.row.original;
        return (
          <div className="min-w-48">
            <p className="font-medium">
              {p.title}
              {p.quantity > 1 && <span className="text-muted-foreground"> × {format.number(p.quantity)}</span>}
            </p>
            {p.vendorName && <p className="text-xs text-muted-foreground">{p.vendorName}</p>}
          </div>
        );
      },
    }),
    col.accessor("category", {
      header: t("finance.purchases.category"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("budget_category", info.getValue()),
    }),
    col.accessor("requestedForName", { header: t("finance.purchases.requestedFor"), cell: (info) => info.getValue() ?? "" }),
    col.accessor("amount", {
      header: t("finance.purchases.amount"),
      cell: (info) => <span className="whitespace-nowrap tabular-nums">{format.currency(info.getValue())}</span>,
    }),
    col.accessor("status", {
      header: t("finance.purchases.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="purchaseStatus" value={info.getValue()} />,
    }),
    col.accessor("createdAt", {
      header: t("finance.purchases.date"),
      cell: (info) => <span className="whitespace-nowrap">{format.date(info.getValue())}</span>,
    }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">{t("common.actions")}</span>,
      cell: (info) => {
        const p = info.row.original;
        const steps = nextPurchaseStatuses(p.status);
        const canReceive = p.status === "received" && p.hardware;
        if (steps.length === 0 && !canReceive) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("finance.purchases.actionsFor", { ref: ref("purchase", p.id) })}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {steps.map((status) => (
                <DropdownMenuItem key={status} disabled={move.isPending} onSelect={() => move.mutate({ id: p.id, status })}>
                  {t(`finance.purchases.${STEP[status]!}`)}
                </DropdownMenuItem>
              ))}
              {canReceive && <DropdownMenuItem onSelect={() => setReceiving(p)}>{t("finance.purchases.addToInventory")}</DropdownMenuItem>}
              {p.status === "requested" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setEditing(p)}>{t("common.edit")}</DropdownMenuItem>
                </>
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
          <Button onClick={() => setEditing("new")}>
            <Plus />
            {t("finance.purchases.new")}
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Hourglass}
          label={t("finance.purchases.summary.awaiting")}
          value={format.number(awaiting.length)}
          hint={t("finance.purchases.summary.value", { amount: total(awaiting) })}
        />
        <StatCard
          icon={CircleCheck}
          label={t("finance.purchases.summary.onOrder")}
          value={format.number(onOrder.length)}
          hint={t("finance.purchases.summary.value", { amount: total(onOrder) })}
        />
        <StatCard
          icon={PackageCheck}
          label={t("finance.purchases.summary.received")}
          value={format.number(received.length)}
          hint={t("finance.purchases.summary.value", { amount: total(received) })}
        />
      </div>
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
          filename: `purchases-${isoDate()}.csv`,
          columns: [
            { header: "Ref", value: (p) => ref("purchase", p.id) },
            { header: "Item", value: (p) => p.title },
            { header: "Category", value: (p) => lookups.label("budget_category", p.category) },
            { header: "Vendor", value: (p) => p.vendorName },
            { header: "Requested for", value: (p) => p.requestedForName },
            { header: "Requested by", value: (p) => p.requestedByName },
            { header: "Quantity", value: (p) => p.quantity },
            { header: "Amount", value: (p) => p.amount },
            { header: "Hardware", value: (p) => (p.hardware ? "Yes" : "No") },
            { header: "Status", value: (p) => p.status },
            { header: "Requested", value: (p) => isoDate(p.createdAt) },
            { header: "Decided by", value: (p) => p.approvedByName },
            { header: "Received", value: (p) => (p.receivedAt ? isoDate(p.receivedAt) : null) },
          ],
        }}
      />
      {editing && <PurchaseDialog purchase={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {receiving && <AssetDialog initial={toAsset(receiving)} onClose={() => setReceiving(null)} />}
    </>
  );
}
