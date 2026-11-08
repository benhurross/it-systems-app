"use client";

import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useState } from "react";
import { DeleteRecord } from "@/components/delete-record";
import { ItFormDialog } from "@/components/it-forms/form-dialog";
import { ItFormSheet } from "@/components/it-forms/sheets";
import { Hint } from "@/components/hint";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import type { ItFormRecord } from "@/lib/api-types";
import { IT_FORM_DATA } from "@/lib/it-forms";

/** A saved form on its sheet: printed (or saved as a PDF from the print window) and signed by hand. */
export default function ItFormPage({ params }: PageProps<"/[locale]/it-forms/[id]">) {
  const { id } = use(params);
  const t = useTranslations("itForms");
  const format = useFormat();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { data: record, isLoading } = useApi<ItFormRecord>(`/it-forms/${id}`);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!record) return <StatusPage kind="notFound" home="/it-forms" />;
  // Read through the form's schema, so a form saved before a field was added still draws.
  const data = IT_FORM_DATA[record.kind].parse(record.data);
  const title = `${t(`kinds.${record.kind}`)}${record.employeeName ? `: ${record.employeeName}` : ""}`;

  return (
    <div className="space-y-6">
      <Link href="/it-forms" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {title}
            <Hint className="ms-1">{t("printHint")}</Hint>
          </h1>
          <p className="text-sm text-muted-foreground">{t("filled", { by: record.createdByName, date: format.dateTime(record.createdAt) })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()}>
            <Printer />
            {t("print")}
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil />
            {t("edit")}
          </Button>
          <DeleteRecord path={`/it-forms/${record.id}`} name={title} onDeleted={() => router.push("/it-forms")} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg bg-muted/40 p-4 print:overflow-visible print:bg-transparent print:p-0">
        <ItFormSheet kind={record.kind} data={data} at={new Date()} />
      </div>
      {editing && <ItFormDialog kind={record.kind} record={record} onClose={() => setEditing(false)} />}
    </div>
  );
}
