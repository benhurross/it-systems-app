"use client";

import { MonitorSmartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AssetDialog } from "@/components/assets/asset-dialog";
import { Hint } from "@/components/hint";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Json } from "@/lib/api-types";
import type * as sightings from "@/server/services/device-sightings";

type Sighting = Json<Awaited<ReturnType<typeof sightings.listSightings>>>[number];

/**
 * The PCs as they describe themselves when someone signs in to Windows, beside the inventory: a PC
 * renamed, on a new address, or never recorded shows here, with the change to take into its asset.
 */
export function SeenAtSignIn() {
  const t = useTranslations("discovery.signIn");
  const format = useFormat();
  const [adding, setAdding] = useState<Sighting | null>(null);
  const { data } = useApi<Sighting[]>("/device-sightings");
  const apply = useApiMutation(({ id, fields }: { id: number; fields: ("name" | "ip" | "mac")[] }) => api(`/device-sightings/${id}/apply`, { body: { fields } }), {
    success: t("updated"),
  });
  const changed = data?.filter((s) => s.changes.notInInventory || s.changes.name || s.changes.ip || s.changes.mac).length ?? 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("title")}
          <Hint>{t("hint")}</Hint>
          {changed > 0 && <StatusBadge tone="warning">{t("toLookAt", { count: changed })}</StatusBadge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? null : data.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MonitorSmartphone className="size-4" aria-hidden />
            {t("none")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("windowsName")}</TableHead>
                <TableHead>{t("asset")}</TableHead>
                <TableHead>{t("ip")}</TableHead>
                <TableHead>{t("lastSignIn")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => {
                const fix = (["name", "ip", "mac"] as const).filter((f) => s.changes[f]);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="block font-medium" dir="ltr">
                        {s.computerName}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground" dir="ltr">
                        {[s.serial && `S/N ${s.serial}`, s.mac].filter(Boolean).join(" · ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      {s.asset ? (
                        <Link href={`/assets/${s.asset.id}`} className="text-primary hover:underline" dir="ltr">
                          {s.asset.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {s.matchedBy && <span className="block text-xs text-muted-foreground">{t(`matchedBy.${s.matchedBy}`)}</span>}
                    </TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs">
                      {s.ip ?? "—"}
                      {s.changes.ip && s.asset?.ipAddress && <span className="block text-muted-foreground line-through">{s.asset.ipAddress}</span>}
                    </TableCell>
                    <TableCell>
                      <span className="block whitespace-nowrap">{format.relative(s.seenAt)}</span>
                      <span className="block text-xs text-muted-foreground" dir="ltr">
                        {s.account}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {s.changes.notInInventory && <StatusBadge tone="warning">{t("notInInventory")}</StatusBadge>}
                        {s.changes.name && <StatusBadge tone="warning">{t("nameChanged")}</StatusBadge>}
                        {s.changes.ip && <StatusBadge tone="info">{t("ipChanged")}</StatusBadge>}
                        {s.changes.mac && <StatusBadge tone="info">{t("macChanged")}</StatusBadge>}
                        {!s.changes.notInInventory && !fix.length && <StatusBadge tone="success">{t("matches")}</StatusBadge>}
                      </span>
                      {s.changes.notInInventory ? (
                        <Button variant="outline" size="sm" className="mt-1.5" onClick={() => setAdding(s)}>
                          {t("add")}
                        </Button>
                      ) : (
                        fix.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-1.5"
                            disabled={apply.isPending}
                            aria-label={t("updateLabel", { asset: s.asset!.name })}
                            onClick={() => apply.mutate({ id: s.id, fields: fix })}
                          >
                            {t("update")}
                          </Button>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {adding && (
        <AssetDialog
          initial={{ name: adding.computerName, serial: adding.serial, macAddress: adding.mac, ipAddress: adding.ip, category: "end_user", type: "desktop", status: "in_use", location: "jeddah", monitorMethod: "none" }}
          onClose={() => setAdding(null)}
        />
      )}
    </Card>
  );
}
