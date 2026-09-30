"use client";

import { Plus, Siren } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge, SlaIndicator } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { Staff, Ticket } from "@/lib/api-types";
import { PRIORITIES, ref, TICKET_STATUSES, type TicketType } from "@/lib/domain";

const col = columnHelper<Ticket>();
const UNASSIGNED = "unassigned";

export default function TicketsPage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [tab, setTab] = useState<"all" | TicketType>("all");
  const { data = [], isLoading } = useApi<Ticket[]>("/tickets");
  const { data: staff = [] } = useApi<Staff[]>("/staff");
  const rows = tab === "all" ? data : data.filter((ticket) => ticket.type === tab);
  const count = (type?: TicketType) => format.number(type ? data.filter((x) => x.type === type).length : data.length);

  const columns = [
    col.accessor((x) => ref("ticket", x.id), {
      id: "ref",
      header: t("tickets.ref"),
      cell: (info) => (
        <Link href={`/tickets/${info.row.original.id}`} className="font-mono text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("subject", {
      header: t("tickets.subject"),
      cell: (info) => <span className="line-clamp-1 max-w-72">{info.getValue()}</span>,
    }),
    col.accessor("requesterName", { header: t("tickets.requester") }),
    col.accessor("type", {
      header: t("tickets.type"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="ticketType" value={info.getValue()} />,
    }),
    col.accessor("priority", {
      header: t("tickets.priority"),
      filterFn: "arrHas",
      sortFn: (a, b) => PRIORITIES.indexOf(a.original.priority) - PRIORITIES.indexOf(b.original.priority),
      cell: (info) => <EnumBadge kind="priority" value={info.getValue()} />,
    }),
    col.accessor("status", {
      header: t("tickets.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="ticketStatus" value={info.getValue()} />,
    }),
    col.accessor("issueType", {
      header: t("tickets.issueType"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("issue_type", info.getValue()),
    }),
    col.accessor("location", {
      header: t("tickets.location"),
      filterFn: "arrHas",
      cell: (info) => lookups.label("location", info.getValue()),
    }),
    col.accessor((x) => x.assigneeId ?? UNASSIGNED, {
      id: "assignee",
      header: t("tickets.assignee"),
      filterFn: "arrHas",
      cell: (info) => info.row.original.assigneeName ?? <span className="text-muted-foreground">{t("tickets.unassigned")}</span>,
    }),
    col.accessor("dueAt", {
      header: t("tickets.sla"),
      cell: (info) => <SlaIndicator ticket={info.row.original} />,
    }),
    col.accessor("createdAt", {
      header: t("tickets.created"),
      cell: (info) => <span className="whitespace-nowrap">{format.date(info.getValue())}</span>,
    }),
  ];

  return (
    <>
      <PageHeader
        title={t("tickets.title")}
        description={t("tickets.intro")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/tickets/new?type=incident">
                <Siren />
                {t("tickets.reportIncident")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/tickets/new">
                <Plus />
                {t("tickets.new")}
              </Link>
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="gap-4">
        {/* Wraps onto a second row when the counts do not fit across a phone at large text sizes. */}
        <TabsList className="max-w-full flex-wrap group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="all">
            {t("tickets.all")} ({count()})
          </TabsTrigger>
          <TabsTrigger value="incident">
            {t("tickets.incidents")} ({count("incident")})
          </TabsTrigger>
          <TabsTrigger value="request">
            {t("tickets.requests")} ({count("request")})
          </TabsTrigger>
        </TabsList>
        {/* The list is the panel of the selected tab, so each tab points at what it shows. */}
        <TabsContent value={tab} className="text-base">
          <DataTable
            key={tab}
            data={rows}
            columns={columns}
            loading={isLoading}
            rowHref={(x) => `/tickets/${x.id}`}
            facets={[
              { column: "status", label: t("tickets.status"), options: TICKET_STATUSES.map((s) => ({ value: s, label: t(`enums.ticketStatus.${s}`) })) },
              { column: "priority", label: t("tickets.priority"), options: PRIORITIES.map((p) => ({ value: p, label: t(`enums.priority.${p}`) })) },
              { column: "issueType", label: t("tickets.issueType"), options: lookups.options("issue_type") },
              { column: "location", label: t("tickets.location"), options: lookups.options("location") },
              {
                column: "assignee",
                label: t("tickets.assignee"),
                options: [{ value: UNASSIGNED, label: t("tickets.unassigned") }, ...staff.map((s) => ({ value: s.id, label: s.name }))],
              },
            ]}
            csv={{
              filename: "tickets.csv",
              columns: [
                { header: "Ticket", value: (x) => ref("ticket", x.id) },
                { header: "Opened", value: (x) => x.createdAt },
                { header: "Type", value: (x) => x.type },
                { header: "Status", value: (x) => x.status },
                { header: "Priority", value: (x) => x.priority },
                { header: "Issue type", value: (x) => lookups.label("issue_type", x.issueType) },
                { header: "Location", value: (x) => lookups.label("location", x.location) },
                { header: "Requester", value: (x) => x.requesterName },
                { header: "Assigned to", value: (x) => x.assigneeName },
                { header: "Subject", value: (x) => x.subject },
                { header: "Due", value: (x) => x.dueAt },
                { header: "Resolved", value: (x) => x.resolvedAt },
                { header: "Closed", value: (x) => x.closedAt },
                { header: "Rating", value: (x) => x.satisfaction },
              ],
            }}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
