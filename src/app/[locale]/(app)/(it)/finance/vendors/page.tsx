"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { columnHelper, DataTable } from "@/components/data-table";
import { VendorDialog } from "@/components/finance/dialogs";
import { FinanceHeader } from "@/components/finance/finance-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import type { Vendor } from "@/lib/api-types";

const col = columnHelper<Vendor>();

export default function VendorsPage() {
  const t = useTranslations("finance.vendors");
  const lookups = useLookups();
  const [dialog, setDialog] = useState<Vendor | "new" | null>(null);
  const { data = [], isLoading } = useApi<Vendor[]>("/vendors");

  const columns = [
    col.accessor("name", {
      header: t("name"),
      cell: (info) => (
        <button type="button" onClick={() => setDialog(info.row.original)} className="text-start font-medium hover:text-primary">
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("category", {
      header: t("category"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("vendor_category", info.getValue()),
    }),
    col.accessor("contactName", { header: t("contact"), cell: (info) => info.getValue() ?? "—" }),
    col.accessor("email", {
      header: t("email"),
      cell: (info) =>
        info.getValue() ? (
          <a href={`mailto:${info.getValue()}`} dir="ltr" className="text-primary hover:underline">
            {info.getValue()}
          </a>
        ) : (
          "—"
        ),
    }),
    col.accessor("phone", {
      header: t("phone"),
      cell: (info) => (info.getValue() ? <span dir="ltr">{info.getValue()}</span> : "—"),
    }),
    col.accessor("website", {
      header: t("website"),
      cell: (info) =>
        info.getValue() ? (
          <a href={info.getValue()!} target="_blank" rel="noreferrer" dir="ltr" className="text-primary hover:underline">
            {new URL(info.getValue()!).hostname}
          </a>
        ) : (
          "—"
        ),
    }),
    col.accessor((v) => (v.active ? "active" : "inactive"), {
      id: "status",
      header: t("status"),
      filterFn: "arrHas",
      cell: (info) =>
        info.getValue() === "active" ? <StatusBadge tone="success">{t("active")}</StatusBadge> : <StatusBadge tone="neutral">{t("inactive")}</StatusBadge>,
    }),
  ];

  return (
    <>
      <FinanceHeader
        actions={
          <Button onClick={() => setDialog("new")}>
            <Plus />
            {t("add")}
          </Button>
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        facets={[
          { column: "category", label: t("category"), options: lookups.options("vendor_category") },
          {
            column: "status",
            label: t("status"),
            options: [
              { value: "active", label: t("active") },
              { value: "inactive", label: t("inactive") },
            ],
          },
        ]}
      />
      {dialog === "new" && <VendorDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== "new" && <VendorDialog vendor={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}
