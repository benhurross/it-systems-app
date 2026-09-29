"use client";

import { ArrowLeft, ArrowRightLeft, Archive, Network, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useState, type ReactNode } from "react";
import { AssetDialog, toAssetInput } from "@/components/assets/asset-dialog";
import { MoveDialog } from "@/components/assets/move-dialog";
import { EnumBadge } from "@/components/badges";
import { StatusBadge } from "@/components/status-badge";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { AssetDetail } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { ref } from "@/lib/domain";
import { assetFlags, type AssetFlags } from "@/lib/lifecycle";

export default function AssetPage({ params }: PageProps<"/[locale]/assets/[id]">) {
  const { id } = use(params);
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [dialog, setDialog] = useState<"edit" | "move" | null>(null);
  const { data: asset, isLoading } = useApi<AssetDetail>(`/assets/${id}`);
  const retire = useApiMutation(
    () => api(`/assets/${id}`, { method: "PATCH", body: { ...toAssetInput(asset!), status: "retired", assignedTo: null } }),
    { success: t("assets.retired") },
  );

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!asset) return <StatusPage kind="notFound" home="/assets/inventory" />;

  const flags = assetFlags(asset, isoDate());
  const raised = (Object.keys(flags) as (keyof AssetFlags)[]).filter((k) => flags[k]);
  const dash = <span className="text-muted-foreground">—</span>;

  return (
    <div className="space-y-6">
      <Link href="/assets/inventory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("assets.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-muted-foreground">{ref("asset", asset.id)}</span>
            <EnumBadge kind="assetStatus" value={asset.status} />
            <EnumBadge kind="criticality" value={asset.criticality} />
            {asset.monitorMethod !== "none" && <EnumBadge kind="deviceStatus" value={asset.monitorStatus} />}
            {raised.map((f) => (
              <StatusBadge key={f} tone={f === "warrantyExpiring" ? "warning" : "danger"}>
                {t(`assets.flags.${f}`)}
              </StatusBadge>
            ))}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{asset.name}</h1>
          <p className="text-muted-foreground">
            {lookups.label("asset_type", asset.type)} · {lookups.label("location", asset.location)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/cmdb?item=${asset.id}`}>
              <Network />
              {t("assets.openCmdb")}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setDialog("edit")}>
            <Pencil />
            {t("common.edit")}
          </Button>
          {asset.status !== "retired" && (
            <>
              <Button variant="outline" onClick={() => setDialog("move")}>
                <ArrowRightLeft />
                {t("assets.move")}
              </Button>
              <Button variant="outline" onClick={() => retire.mutate(undefined)} disabled={retire.isPending}>
                <Archive />
                {t("assets.retire")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("assets.specs")}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y text-sm">
                  <Row label={t("assets.category")}>{lookups.label("asset_category", asset.category)}</Row>
                  <Row label={t("assets.model")}>
                    {[lookups.label("manufacturer", asset.manufacturer), asset.model].filter(Boolean).join(" ") || dash}
                  </Row>
                  <Row label={t("assets.serial")}>{asset.serial ?? dash}</Row>
                  <Row label={t("assets.os")}>{asset.os ?? dash}</Row>
                  <Row label={t("assets.ipAddress")}>{asset.ipAddress ? <span dir="ltr" className="font-mono">{asset.ipAddress}</span> : dash}</Row>
                  <Row label={t("assets.macAddress")}>{asset.macAddress ? <span dir="ltr" className="font-mono">{asset.macAddress}</span> : dash}</Row>
                  <Row label={t("assets.assignedTo")}>{asset.assignedName ?? t("assets.unassigned")}</Row>
                  <Row label={t("assets.monitorMethod")}>
                    {t(`enums.monitorMethod.${asset.monitorMethod}`)}
                    {asset.monitorMethod === "tcp" && asset.monitorPort && ` ${asset.monitorPort}`}
                  </Row>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("assets.lifecycle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y text-sm">
                  <Row label={t("assets.purchaseDate")}>{asset.purchaseDate ? format.date(asset.purchaseDate) : dash}</Row>
                  <Row label={t("assets.purchaseCost")}>{asset.purchaseCost !== null ? format.currency(asset.purchaseCost) : dash}</Row>
                  {asset.purchaseId && (
                    <Row label={t("assets.purchase")}>
                      <Link href="/finance/purchases" className="font-mono text-primary hover:underline">
                        {ref("purchase", asset.purchaseId)}
                      </Link>
                    </Row>
                  )}
                  <Row label={t("assets.warrantyEnd")}>{asset.warrantyEnd ? format.date(asset.warrantyEnd) : dash}</Row>
                  <Row label={t("assets.supportStatus")}>
                    <EnumBadge kind="supportStatus" value={asset.supportStatus} />
                  </Row>
                  {asset.notes && <Row label={t("assets.notes")}>{asset.notes}</Row>}
                </dl>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t("assets.movements")}</CardTitle>
            </CardHeader>
            <CardContent>
              {asset.movements.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("assets.noMovements")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("assets.from")}</TableHead>
                      <TableHead>{t("assets.to")}</TableHead>
                      <TableHead>{t("assets.reason")}</TableHead>
                      <TableHead>{t("assets.by")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {asset.movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{format.date(m.movedAt)}</TableCell>
                        <TableCell>{[lookups.label("location", m.fromLocation), m.fromEmployeeName].filter(Boolean).join(" · ")}</TableCell>
                        <TableCell>{[lookups.label("location", m.toLocation), m.toEmployeeName].filter(Boolean).join(" · ")}</TableCell>
                        <TableCell>{m.reason}</TableCell>
                        <TableCell>{m.movedBy}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("assets.relationships")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {asset.relationships.map((r) => {
                  const outgoing = r.sourceId === asset.id;
                  const otherId = outgoing ? r.targetId : r.sourceId;
                  const otherName = outgoing ? r.targetName : r.sourceName;
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">
                        {outgoing ? t(`enums.relationType.${r.type}`) : `${t("cmdb.reliedOnBy")} (${t(`enums.relationType.${r.type}`)})`}
                      </span>
                      <Link href={`/assets/${otherId}`} className="font-medium text-primary hover:underline">
                        {otherName}
                      </Link>
                    </li>
                  );
                })}
                {asset.relationships.length === 0 && <li className="text-muted-foreground">{t("cmdb.noImpact")}</li>}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("assets.software")}</CardTitle>
            </CardHeader>
            <CardContent>
              {asset.software.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("assets.noSoftware")}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {asset.software.map((s) => (
                    <li key={s.licenseId}>
                      <Link href={`/software/${s.licenseId}`} className="text-primary hover:underline">
                        {s.product}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("assets.tickets")}</CardTitle>
            </CardHeader>
            <CardContent>
              {asset.tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("assets.noTickets")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {asset.tickets.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-2">
                      <Link href={`/tickets/${x.id}`} className="truncate text-primary hover:underline">
                        <span className="font-mono">{ref("ticket", x.id)}</span> {x.subject}
                      </Link>
                      <EnumBadge kind="ticketStatus" value={x.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {dialog === "edit" && <AssetDialog asset={asset} onClose={() => setDialog(null)} />}
      {dialog === "move" && <MoveDialog asset={asset} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
