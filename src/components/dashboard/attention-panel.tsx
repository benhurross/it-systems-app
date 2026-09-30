"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { DashboardData } from "@/lib/api-types";
import type { AttentionKind } from "@/lib/dashboard";

/** Where each group's full list lives. */
const SECTION: Record<AttentionKind, string> = {
  sla: "/tickets",
  down: "/network",
  licenses: "/software",
  contracts: "/finance/contracts",
  warranties: "/assets/inventory",
  vulnerabilities: "/risk/vulnerabilities",
  offboarding: "/people/offboarding",
};

/** What is late or about to be, grouped, soonest first. */
export function AttentionPanel({ groups }: { groups: DashboardData["attention"] }) {
  const t = useTranslations("dashboard.attention");
  const format = useFormat();

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-muted-foreground" />
            {t("title")}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-success" />
            {t("none")}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.kind} aria-labelledby={`attention-${group.kind}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id={`attention-${group.kind}`} className="text-sm font-medium">
                <Link href={SECTION[group.kind]} className="hover:text-primary">
                  {t(`kinds.${group.kind}`)}
                </Link>
              </h3>
              <span className="rounded-full bg-danger-soft px-2 text-xs font-medium text-danger tabular-nums">{format.number(group.count)}</span>
            </div>
            <ul className="divide-y text-sm">
              {group.items.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <Link href={item.href} className="min-w-0 truncate hover:text-primary">
                    {item.label}
                  </Link>
                  {item.date && group.kind !== "down" && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t(`when.${group.kind}`, { date: group.kind === "sla" ? format.dateTime(item.date) : format.date(item.date) })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {group.count > group.items.length && (
              <Link href={SECTION[group.kind]} className="mt-1 inline-block text-xs text-primary hover:underline">
                {t("more", { count: format.number(group.count) })}
              </Link>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
