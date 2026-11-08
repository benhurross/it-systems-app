"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { AssetDetail } from "@/lib/api-types";
import { deviceChanges } from "@/lib/device-match";

/** The latest the PC said of itself at a Windows sign-in, and what differs from this record. */
export function SignInCard({ asset }: { asset: AssetDetail }) {
  const t = useTranslations("discovery.signIn");
  const format = useFormat();
  const s = asset.signIn;
  if (!s) return null;
  const changes = deviceChanges(s, asset);
  const rows: [string, string][] = [
    [t("windowsName"), s.computerName],
    [t("ip"), s.ip ?? "—"],
    [t("signedIn"), s.account || "—"],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium" dir="ltr">
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">{t("seen", { when: format.dateTime(s.seenAt) })}</p>
        {(changes.name || changes.ip || changes.mac) && (
          <div className="flex flex-wrap items-center gap-2">
            {changes.name && <StatusBadge tone="warning">{t("nameChanged")}</StatusBadge>}
            {changes.ip && <StatusBadge tone="info">{t("ipChanged")}</StatusBadge>}
            {changes.mac && <StatusBadge tone="info">{t("macChanged")}</StatusBadge>}
            <Link href="/assets/discovery" className="text-xs text-primary hover:underline">
              {t("review")}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
