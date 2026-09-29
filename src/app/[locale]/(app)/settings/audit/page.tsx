"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { columnHelper, DataTable } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import type { AuditEntry } from "@/lib/api-types";
import { addDays, isoDate } from "@/lib/dates";

const col = columnHelper<AuditEntry>();

export default function AuditPage() {
  const t = useTranslations("settings.audit");
  const format = useFormat();
  const [from, setFrom] = useState(() => addDays(isoDate(), -30));
  const [to, setTo] = useState(() => isoDate());
  const { data = [], isLoading } = useApi<AuditEntry[]>(`/audit?from=${from}&to=${to}`);

  const distinct = (values: string[]) => [...new Set(values)].sort().map((v) => ({ value: v, label: v }));
  const columns = [
    col.accessor("at", {
      header: t("when"),
      cell: (info) => <span className="whitespace-nowrap">{format.dateTime(info.getValue())}</span>,
    }),
    col.accessor("userName", { header: t("who"), filterFn: "arrHas" }),
    col.accessor("action", { header: t("action"), filterFn: "arrHas" }),
    col.accessor("entity", { header: t("entity"), filterFn: "arrHas" }),
    col.accessor("summary", { header: t("summary"), enableSorting: false }),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="audit-from">{t("from")}</Label>
          <Input id="audit-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-to">{t("to")}</Label>
          <Input id="audit-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      </div>
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        pageSize={25}
        initialSort={{ id: "at", desc: true }}
        facets={[
          { column: "userName", label: t("who"), options: distinct(data.map((e) => e.userName)) },
          { column: "entity", label: t("entity"), options: distinct(data.map((e) => e.entity)) },
          { column: "action", label: t("action"), options: distinct(data.map((e) => e.action)) },
        ]}
        csv={{
          filename: `audit-${from}-${to}.csv`,
          columns: [
            { header: "When", value: (e) => e.at },
            { header: "Who", value: (e) => e.userName },
            { header: "Action", value: (e) => e.action },
            { header: "Record type", value: (e) => e.entity },
            { header: "Record", value: (e) => e.entityId },
            { header: "What happened", value: (e) => e.summary },
          ],
        }}
      />
    </div>
  );
}
