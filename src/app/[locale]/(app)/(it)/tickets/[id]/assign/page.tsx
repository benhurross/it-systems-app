"use client";

import { UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Staff, TicketDetail } from "@/lib/api-types";
import { ref } from "@/lib/domain";

/**
 * Where the "Accept" and "Assign to" links in a new-ticket email lead, after sign-in. Opening it
 * changes nothing: it shows the ticket and asks to confirm, so a link opened by a mail scanner is harmless.
 */
export default function AssignPage({ params }: PageProps<"/[locale]/tickets/[id]/assign">) {
  const { id } = use(params);
  return (
    <Suspense>
      <Assign id={Number(id)} />
    </Suspense>
  );
}

function Assign({ id }: { id: number }) {
  const t = useTranslations("assign");
  const format = useFormat();
  const lookups = useLookups();
  const router = useRouter();
  const me = useCurrentUser();
  const to = useSearchParams().get("to");
  const { data: ticket } = useApi<TicketDetail>(`/tickets/${id}`);
  const { data: staff } = useApi<Staff[]>("/staff");
  const target = staff?.find((s) => s.id === (to === "me" ? me.id : to));
  const assign = useApiMutation(() => api(`/tickets/${id}`, { method: "PATCH", body: { assigneeId: target!.id } }), {
    success: t("done", { ref: ref("ticket", id), name: target?.name ?? "" }),
    onSuccess: () => router.replace(`/tickets/${id}`),
  });

  if (!ticket || !staff || !lookups.ready) {
    return (
      <>
        <PageHeader title={t("title", { ref: ref("ticket", id) })} />
        <Skeleton className="h-80 max-w-2xl" />
      </>
    );
  }

  const already = target && ticket.assigneeId === target.id;
  return (
    <>
      <PageHeader title={t("title", { ref: ref("ticket", id) })} />
      <Card className="max-w-2xl">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <EnumBadge kind="ticketType" value={ticket.type} />
            <EnumBadge kind="ticketStatus" value={ticket.status} />
            <EnumBadge kind="priority" value={ticket.priority} />
          </div>
          <p className="text-lg font-medium break-words">{ticket.subject}</p>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-muted-foreground">{t("requester")}</dt>
            <dd className="break-words">
              {ticket.requesterName} · {lookups.label("department", ticket.requesterDepartment)}
            </dd>
            <dt className="text-muted-foreground">{t("issueType")}</dt>
            <dd>{lookups.label("issue_type", ticket.issueType)}</dd>
            <dt className="text-muted-foreground">{t("created")}</dt>
            <dd>{format.dateTime(ticket.createdAt)}</dd>
            <dt className="text-muted-foreground">{t("current")}</dt>
            <dd>{ticket.assigneeName ?? t("unassigned")}</dd>
            <dt className="text-muted-foreground">{t("description")}</dt>
            <dd className="break-words whitespace-pre-line">{ticket.description}</dd>
          </dl>
          {!target ? (
            <Alert>
              <AlertDescription>{t("gone")}</AlertDescription>
            </Alert>
          ) : already ? (
            <Alert>
              <AlertDescription>{t("already", { ref: ref("ticket", id), name: target.name })}</AlertDescription>
            </Alert>
          ) : (
            ticket.assigneeName && (
              <Alert>
                <AlertDescription>{t("replaces", { name: ticket.assigneeName })}</AlertDescription>
              </Alert>
            )
          )}
        </CardContent>
        <CardFooter className="mt-2 flex-wrap gap-2">
          {target && !already && (
            <Button onClick={() => assign.mutate(undefined)} disabled={assign.isPending}>
              <UserCheck />
              {target.id === me.id ? t("accept") : t("assignTo", { name: target.name })}
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/tickets/${id}`}>{t("open")}</Link>
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
