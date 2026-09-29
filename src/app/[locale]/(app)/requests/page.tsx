"use client";

import { Inbox, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { Ticket } from "@/lib/api-types";
import { ref } from "@/lib/domain";

const col = columnHelper<Ticket>();

export default function MyRequestsPage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const { data = [], isLoading } = useApi<Ticket[]>("/tickets");

  const newRequest = (
    <Button asChild>
      <Link href="/requests/new">
        <Plus />
        {t("requests.new")}
      </Link>
    </Button>
  );

  const columns = [
    col.accessor((x) => ref("ticket", x.id), {
      id: "ref",
      header: t("tickets.ref"),
      cell: (info) => (
        <Link href={`/requests/${info.row.original.id}`} className="font-mono text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("subject", { header: t("tickets.subject") }),
    col.accessor("issueType", { header: t("tickets.issueType"), cell: (info) => lookups.label("issue_type", info.getValue()) }),
    col.accessor("status", { header: t("tickets.status"), cell: (info) => <EnumBadge kind="ticketStatus" value={info.getValue()} /> }),
    col.accessor("assigneeName", {
      header: t("tickets.assignee"),
      cell: (info) => info.getValue() ?? <span className="text-muted-foreground">{t("tickets.unassigned")}</span>,
    }),
    col.accessor("createdAt", { header: t("tickets.created"), cell: (info) => format.date(info.getValue()) }),
  ];

  return (
    <>
      <PageHeader title={t("requests.title")} description={t("requests.description")} actions={newRequest} />
      {!isLoading && data.length === 0 ? (
        <EmptyState icon={Inbox} title={t("requests.empty")} action={newRequest} />
      ) : (
        <DataTable data={data} columns={columns} loading={isLoading} rowHref={(x) => `/requests/${x.id}`} />
      )}
    </>
  );
}
