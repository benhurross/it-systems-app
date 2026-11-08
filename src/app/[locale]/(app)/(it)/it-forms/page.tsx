"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { columnHelper, DataTable } from "@/components/data-table";
import { ItFormDialog } from "@/components/it-forms/form-dialog";
import { NewFormMenu } from "@/components/it-forms/new-form-menu";
import { PageHeader } from "@/components/page-header";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { ItFormRow } from "@/lib/api-types";
import { FORM_DOCUMENT, IT_FORM_KINDS, type ItFormKind } from "@/lib/it-forms";

const col = columnHelper<ItFormRow>();

/** IT's paper forms, filled in here and printed to be signed. */
export default function ItFormsPage() {
  const t = useTranslations();
  const format = useFormat();
  const [creating, setCreating] = useState<ItFormKind | null>(null);
  const { data = [], isLoading } = useApi<ItFormRow[]>("/it-forms");

  const columns = [
    col.accessor("createdAt", {
      header: t("itForms.date"),
      cell: (info) => (
        <Link href={`/it-forms/${info.row.original.id}`} className="whitespace-nowrap text-primary hover:underline">
          {format.date(info.getValue())}
        </Link>
      ),
    }),
    col.accessor("kind", {
      header: t("itForms.form"),
      filterFn: "arrHas",
      cell: (info) => (
        <span>
          {t(`itForms.kinds.${info.getValue()}`)}
          <span className="block font-mono text-xs text-muted-foreground" dir="ltr">
            {FORM_DOCUMENT[info.getValue()].formatNo}
          </span>
        </span>
      ),
    }),
    col.accessor("employeeName", { header: t("itForms.employee"), cell: (info) => info.getValue() || "—" }),
    col.accessor("createdByName", { header: t("itForms.filledBy") }),
  ];

  return (
    <>
      <PageHeader
        title={t("itForms.title")}
        description={t("itForms.description")}
        actions={
          <NewFormMenu onPick={setCreating}>
            <Plus />
            {t("itForms.new")}
            <ChevronDown className="opacity-60" />
          </NewFormMenu>
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        rowHref={(f) => `/it-forms/${f.id}`}
        initialSort={{ id: "createdAt", desc: true }}
        facets={[{ column: "kind", label: t("itForms.form"), options: IT_FORM_KINDS.map((k) => ({ value: k, label: t(`itForms.kinds.${k}`) })) }]}
      />
      {creating && <ItFormDialog kind={creating} onClose={() => setCreating(null)} />}
    </>
  );
}
