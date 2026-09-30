"use client";

import { ArrowLeft, Mail, Pencil, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useState } from "react";
import { EnumBadge } from "@/components/badges";
import { EmployeeDialog } from "@/components/people/dialogs";
import { StatusBadge } from "@/components/status-badge";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { EmployeeProfile } from "@/lib/api-types";
import { ref } from "@/lib/domain";

export default function EmployeePage({ params }: PageProps<"/[locale]/people/directory/[id]">) {
  const { id } = use(params);
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [editing, setEditing] = useState(false);
  const { data: person, isLoading } = useApi<EmployeeProfile>(`/employees/${id}`);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!person) return <StatusPage kind="notFound" home="/people/directory" />;

  return (
    <div className="space-y-6">
      <Link href="/people/directory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("people.directory.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          {person.active ? (
            <StatusBadge tone="success">{t("people.directory.current")}</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">{t("people.directory.left")}</StatusBadge>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
          <p className="text-muted-foreground">
            {person.employeeNumber && (
              <>
                <span dir="ltr">{t("people.idLabel", { number: person.employeeNumber })}</span> ·{" "}
              </>
            )}
            {person.jobTitle} · {lookups.label("department", person.department)} · {lookups.label("location", person.location)}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline" dir="ltr">
              <Mail className="size-4" />
              {person.email}
            </a>
            {person.phone && (
              <span className="inline-flex items-center gap-1.5" dir="ltr">
                <Phone className="size-4 text-muted-foreground" />
                {person.phone}
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil />
          {t("common.edit")}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {t("people.directory.assets")} ({format.number(person.assets.length)})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {person.assets.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("people.directory.noAssets")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {person.assets.map((asset) => (
                  <li key={asset.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <Link href={`/assets/${asset.id}`} className="min-w-0 break-words hover:text-primary">
                      <span className="font-medium">{asset.name}</span>{" "}
                      <span className="text-muted-foreground">· {lookups.label("asset_type", asset.type)}</span>
                    </Link>
                    <EnumBadge kind="assetStatus" value={asset.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("people.directory.tickets")}</CardTitle>
          </CardHeader>
          <CardContent>
            {person.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("people.directory.noTickets")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {person.tickets.map((ticket) => (
                  <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <Link href={`/tickets/${ticket.id}`} className="min-w-0 break-words hover:text-primary">
                      <span className="font-mono text-muted-foreground">{ref("ticket", ticket.id)}</span> {ticket.subject}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{format.date(ticket.createdAt)}</span>
                      <EnumBadge kind="ticketStatus" value={ticket.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {editing && <EmployeeDialog employee={person} onClose={() => setEditing(false)} />}
    </div>
  );
}
