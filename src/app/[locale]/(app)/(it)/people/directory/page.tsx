"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { columnHelper, DataTable } from "@/components/data-table";
import { EmployeeDialog } from "@/components/people/dialogs";
import { PeopleHeader } from "@/components/people/people-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { Employee } from "@/lib/api-types";

const col = columnHelper<Employee>();

export default function DirectoryPage() {
  const t = useTranslations("people");
  const lookups = useLookups();
  const [adding, setAdding] = useState(false);
  const { data = [], isLoading } = useApi<Employee[]>("/employees");
  // An ID number held by more than one current employee is flagged, to be corrected.
  const holders = new Map<string, number>();
  for (const e of data) if (e.active && e.employeeNumber) holders.set(e.employeeNumber, (holders.get(e.employeeNumber) ?? 0) + 1);

  const columns = [
    col.accessor("employeeNumber", {
      header: t("employeeNumber"),
      cell: (info) => {
        const number = info.getValue();
        if (!number) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono tabular-nums" dir="ltr">
              {number}
            </span>
            {info.row.original.active && (holders.get(number) ?? 0) > 1 && <StatusBadge tone="warning">{t("directory.duplicate")}</StatusBadge>}
          </span>
        );
      },
    }),
    col.accessor("name", {
      header: t("name"),
      cell: (info) => (
        <Link href={`/people/directory/${info.row.original.id}`} className="font-medium hover:text-primary">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("jobTitle", { header: t("jobTitle") }),
    col.accessor("department", {
      header: t("department"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("department", info.getValue()),
    }),
    col.accessor("location", {
      header: t("location"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("location", info.getValue()),
    }),
    col.accessor("email", { header: t("email"), cell: (info) => <span dir="ltr">{info.getValue()}</span> }),
    col.accessor("phone", { header: t("phone"), cell: (info) => (info.getValue() ? <span dir="ltr">{info.getValue()}</span> : "—") }),
    col.accessor((e) => (e.active ? "current" : "left"), {
      id: "status",
      header: t("status"),
      filterFn: "arrHas",
      cell: (info) =>
        info.getValue() === "current" ? (
          <StatusBadge tone="success">{t("directory.current")}</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">{t("directory.left")}</StatusBadge>
        ),
    }),
  ];

  return (
    <>
      <PeopleHeader
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("directory.add")}
          </Button>
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        rowHref={(e) => `/people/directory/${e.id}`}
        facets={[
          { column: "department", label: t("department"), options: lookups.options("department") },
          { column: "location", label: t("location"), options: lookups.options("location") },
          {
            column: "status",
            label: t("status"),
            options: [
              { value: "current", label: t("directory.current") },
              { value: "left", label: t("directory.left") },
            ],
          },
        ]}
        csv={{
          filename: "directory.csv",
          columns: [
            { header: "ID number", value: (e) => e.employeeNumber },
            { header: "Name", value: (e) => e.name },
            { header: "Job title", value: (e) => e.jobTitle },
            { header: "Department", value: (e) => lookups.label("department", e.department) },
            { header: "Location", value: (e) => lookups.label("location", e.location) },
            { header: "Email", value: (e) => e.email },
            { header: "Phone", value: (e) => e.phone },
            { header: "Status", value: (e) => (e.active ? "current" : "left") },
          ],
        }}
      />
      {adding && <EmployeeDialog onClose={() => setAdding(false)} />}
    </>
  );
}
