"use client";

import { BellRing, Check, Ticket } from "lucide-react";
import { useTranslations } from "next-intl";
import { EnumBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Alert } from "@/lib/api-types";

/** Open and acknowledged alerts with their actions, then those resolved in the last week. */
export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const router = useRouter();
  const acknowledge = useApiMutation((id: number) => api(`/alerts/${id}/acknowledge`, { method: "POST" }), {
    success: t("alerts.acknowledged"),
  });
  const ticket = useApiMutation((id: number) => api<{ id: number }>(`/alerts/${id}/ticket`, { method: "POST" }), {
    onSuccess: ({ id }) => router.push(`/tickets/${id}`),
  });
  const active = alerts.filter((a) => a.status !== "resolved");
  const resolved = alerts.filter((a) => a.status === "resolved");

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4 text-muted-foreground" />
          {t("alerts.title")}
          {active.length > 0 && (
            <span className="rounded-full bg-danger-soft px-2 text-xs font-medium text-danger">{format.number(active.length)}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("alerts.none")}</p>
        ) : (
          <ul className="space-y-3" aria-label={t("alerts.title")}>
            {active.map((alert) => (
              <li key={alert.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/assets/${alert.assetId}`} className="block font-medium break-words hover:text-primary">
                      {alert.assetName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {lookups.label("location", alert.location)} · {t("alerts.opened", { time: format.relative(alert.openedAt) })}
                    </p>
                  </div>
                  <EnumBadge kind="deviceStatus" value={alert.kind} />
                </div>
                {alert.acknowledgedByName && (
                  <p className="text-xs text-muted-foreground">{t("alerts.acknowledgedBy", { name: alert.acknowledgedByName })}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {alert.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => acknowledge.mutate(alert.id)} disabled={acknowledge.isPending}>
                      <Check />
                      {t("alerts.acknowledge")}
                    </Button>
                  )}
                  {alert.ticketId ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/tickets/${alert.ticketId}`}>
                        <Ticket />
                        {t("alerts.viewTicket")}
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => ticket.mutate(alert.id)} disabled={ticket.isPending}>
                      <Ticket />
                      {t("alerts.createTicket")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {resolved.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">{t("alerts.recent")}</p>
            <ul className="divide-y text-sm">
              {resolved.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">
                    {alert.assetName} <span className="text-muted-foreground">· {t(`enums.alertKind.${alert.kind}`)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t("alerts.resolvedAt", { time: format.relative(alert.resolvedAt!) })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
