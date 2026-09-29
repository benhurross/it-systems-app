"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AssetDialog } from "@/components/assets/asset-dialog";
import { AssetsHeader } from "@/components/assets/assets-header";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { Asset } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { ASSET_STATUSES, ref } from "@/lib/domain";
import { assetFlags, type AssetFlags } from "@/lib/lifecycle";

type Row = Asset & { flags: (keyof AssetFlags)[] };
const col = columnHelper<Row>();

export default function InventoryPage() {
  const t = useTranslations();
  const lookups = useLookups();
  const [adding, setAdding] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const { data = [], isLoading } = useApi<Asset[]>("/assets");
  const today = isoDate();
  const rows: Row[] = data.map((a) => {
    const flags = assetFlags(a, today);
    return { ...a, flags: (Object.keys(flags) as (keyof AssetFlags)[]).filter((k) => flags[k]) };
  });
  const shown = attentionOnly ? rows.filter((r) => r.flags.length > 0) : rows;

  const columns = [
    col.accessor((a) => ref("asset", a.id), {
      id: "tag",
      header: t("assets.tag"),
      cell: (info) => (
        <Link href={`/assets/${info.row.original.id}`} className="font-mono text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("name", { header: t("assets.name"), cell: (info) => <span className="font-medium">{info.getValue()}</span> }),
    col.accessor("category", { header: t("assets.category"), filterFn: "arrHas", cell: (info) => lookups.label("asset_category", info.getValue()) }),
    col.accessor("type", { header: t("assets.type"), cell: (info) => lookups.label("asset_type", info.getValue()) }),
    col.accessor((a) => [lookups.label("manufacturer", a.manufacturer), a.model].filter(Boolean).join(" "), {
      id: "model",
      header: t("assets.model"),
    }),
    col.accessor("status", { header: t("assets.status"), filterFn: "arrHas", cell: (info) => <EnumBadge kind="assetStatus" value={info.getValue()} /> }),
    col.accessor("location", { header: t("assets.location"), filterFn: "arrHas", cell: (info) => lookups.label("location", info.getValue()) }),
    col.accessor("assignedName", {
      header: t("assets.assignedTo"),
      cell: (info) => info.getValue() ?? <span className="text-muted-foreground">{t("assets.unassigned")}</span>,
    }),
    col.accessor("ipAddress", { header: t("assets.ipAddress"), cell: (info) => <span dir="ltr" className="font-mono text-xs">{info.getValue()}</span> }),
    col.accessor((a) => a.flags.join(" "), {
      id: "attention",
      header: t("assets.attention"),
      enableSorting: false,
      cell: (info) => (
        <div className="flex flex-wrap gap-1">
          {info.row.original.flags.map((f) => (
            <StatusBadge key={f} tone={f === "warrantyExpiring" ? "warning" : "danger"}>
              {t(`assets.flags.${f}`)}
            </StatusBadge>
          ))}
        </div>
      ),
    }),
  ];

  return (
    <>
      <AssetsHeader
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("assets.add")}
          </Button>
        }
      />
      <DataTable
        key={String(attentionOnly)}
        data={shown}
        columns={columns}
        loading={isLoading}
        rowHref={(a) => `/assets/${a.id}`}
        facets={[
          { column: "category", label: t("assets.category"), options: lookups.options("asset_category") },
          { column: "status", label: t("assets.status"), options: ASSET_STATUSES.map((s) => ({ value: s, label: t(`enums.assetStatus.${s}`) })) },
          { column: "location", label: t("assets.location"), options: lookups.options("location") },
        ]}
        toolbar={
          <div className="flex items-center gap-2">
            <Switch id="attention-only" checked={attentionOnly} onCheckedChange={setAttentionOnly} />
            <Label htmlFor="attention-only" className="text-sm font-normal">
              {t("assets.attentionOnly")}
            </Label>
          </div>
        }
        csv={{
          filename: "assets.csv",
          columns: [
            { header: "Tag", value: (a) => ref("asset", a.id) },
            { header: "Name", value: (a) => a.name },
            { header: "Category", value: (a) => lookups.label("asset_category", a.category) },
            { header: "Type", value: (a) => lookups.label("asset_type", a.type) },
            { header: "Manufacturer", value: (a) => lookups.label("manufacturer", a.manufacturer) },
            { header: "Model", value: (a) => a.model },
            { header: "Serial", value: (a) => a.serial },
            { header: "Status", value: (a) => a.status },
            { header: "Location", value: (a) => lookups.label("location", a.location) },
            { header: "Assigned to", value: (a) => a.assignedName },
            { header: "Purchased", value: (a) => a.purchaseDate },
            { header: "Cost (SAR)", value: (a) => a.purchaseCost },
            { header: "Warranty ends", value: (a) => a.warrantyEnd },
            { header: "Support", value: (a) => a.supportStatus },
            { header: "IP address", value: (a) => a.ipAddress },
            { header: "MAC address", value: (a) => a.macAddress },
          ],
        }}
      />
      {adding && <AssetDialog onClose={() => setAdding(false)} />}
    </>
  );
}
