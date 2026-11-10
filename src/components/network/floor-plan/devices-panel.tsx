"use client";

import {
  BatteryCharging,
  Box,
  Cctv,
  ExternalLink,
  HardDrive,
  Laptop,
  type LucideIcon,
  MapPinOff,
  Monitor,
  MonitorSmartphone,
  Move,
  Network,
  Phone,
  Printer,
  Router,
  Server,
  ShieldCheck,
  Tv,
  Wifi,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { EnumBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApi } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { Asset, FloorPlan } from "@/lib/api-types";
import { deviceKind, type DeviceKind, type Placed } from "@/lib/plan-devices";
import { cn } from "@/lib/utils";
import type { RingColor } from "./device-models";

export type PlanDeviceRow = FloorPlan["devices"][number];
export type ShownDevice = Placed<PlanDeviceRow> & { kind: DeviceKind };

export const DEVICE_ICON: Record<DeviceKind, LucideIcon> = {
  laptop: Laptop,
  desktop: MonitorSmartphone,
  monitor: Monitor,
  tv: Tv,
  server: Server,
  network: Network,
  router: Router,
  firewall: ShieldCheck,
  accessPoint: Wifi,
  printer: Printer,
  camera: Cctv,
  phone: Phone,
  ups: BatteryCharging,
  storage: HardDrive,
  other: Box,
};

/** The ring's colour: in repair; else, for a monitored device, how it answers; else plain. */
export function ringOf(d: { status: string; monitorMethod: string; monitorStatus: string }): RingColor {
  if (d.status === "in_repair") return "repair";
  if (d.monitorMethod === "none") return "none";
  return d.monitorStatus as RingColor;
}

/** The ring colours as the page's tones, for the 2D plan's markers and the legend. */
export const RING_CLASS: Record<RingColor, string> = {
  up: "border-success bg-success-soft text-success",
  degraded: "border-warning bg-warning-soft text-warning",
  down: "border-danger bg-danger-soft text-danger",
  unknown: "border-muted-foreground bg-muted text-muted-foreground",
  none: "border-primary bg-background text-primary",
  repair: "border-orange-600 bg-orange-100 text-orange-700",
};

/** A device found by a search: by its name, room, holder or address. */
export function deviceMatches(d: PlanDeviceRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [d.name, d.room, d.assignedName, d.ipAddress].some((v) => v && v.toLowerCase().includes(q));
}

/** The device chosen on the plan: what it is, who has it, how it answers, and where it stands. */
export function DeviceCard({ device, onClose, onMove, onRemove }: { device: ShownDevice; onClose: () => void; onMove: () => void; onRemove: () => void }) {
  const t = useTranslations("floorPlan.devices");
  const tc = useTranslations();
  const lookups = useLookups();
  const Icon = DEVICE_ICON[device.kind];
  return (
    <Card aria-live="polite" data-device-card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{device.name}</span>
        </CardTitle>
        <Button variant="ghost" size="icon" className="-mt-1 -me-2 size-8" onClick={onClose} aria-label={t("close")}>
          <X />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          <dt className="text-muted-foreground">{tc("assets.type")}</dt>
          <dd>{lookups.label("asset_type", device.type)}</dd>
          <dt className="text-muted-foreground">{tc("assets.status")}</dt>
          <dd>
            <EnumBadge kind="assetStatus" value={device.status} />
          </dd>
          <dt className="text-muted-foreground">{tc("assets.assignedTo")}</dt>
          <dd>{device.assignedName ?? t("shared")}</dd>
          <dt className="text-muted-foreground">{tc("assets.room")}</dt>
          <dd dir="auto">{device.room || "—"}</dd>
          {device.monitorMethod !== "none" && (
            <>
              <dt className="text-muted-foreground">{t("answers")}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <EnumBadge kind="deviceStatus" value={device.monitorStatus} />
                {device.ipAddress && (
                  <span dir="ltr" className="font-mono text-xs">
                    {device.ipAddress}
                  </span>
                )}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">{t("where")}</dt>
          <dd>{device.exact ? t("placedHere") : device.room ? t("inItsRoom") : t("atOutlet")}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/assets/${device.id}`}>
              <ExternalLink />
              {t("open")}
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onMove}>
            <Move />
            {t("move")}
          </Button>
          {device.onPlan && (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              <MapPinOff />
              {t("remove")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The devices on the plan, by room, and those in a room the drawing does not name, to be placed. */
export function DevicesCard({
  shown,
  unplaced,
  selected,
  onSelect,
  onPlace,
  onAdd,
}: {
  shown: ShownDevice[];
  unplaced: PlanDeviceRow[];
  selected: number | null;
  onSelect: (d: ShownDevice) => void;
  onPlace: (d: PlanDeviceRow) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("floorPlan.devices");
  const rooms = [...new Set(shown.map((d) => d.room))].toSorted((a, b) => (a || "~").localeCompare(b || "~"));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}>
          {t("add")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{shown.length ? t("count", { count: shown.length }) : t("none")}</p>
        {rooms.map((room) => (
          <div key={room} className="space-y-0.5">
            <h3 className="text-xs font-medium text-muted-foreground" dir="auto">
              {room || t("noRoom")}
            </h3>
            <ul className="space-y-0.5">
              {shown
                .filter((d) => d.room === room)
                .map((d) => {
                  const Icon = DEVICE_ICON[d.kind];
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(d)}
                        aria-pressed={d.id === selected}
                        className={cn("flex w-full items-center gap-2 rounded px-1 py-0.5 text-start hover:bg-muted", d.id === selected && "bg-muted font-medium")}
                      >
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{d.name}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
        {unplaced.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <h3 className="font-medium">{t("toPlace")}</h3>
            <p className="text-xs text-muted-foreground">{t("toPlaceHint")}</p>
            <ul className="space-y-1">
              {unplaced.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {d.name}
                    {d.room && <span className="text-muted-foreground"> · {d.room}</span>}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onPlace(d)}>
                    {t("place")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Legend />
      </CardContent>
    </Card>
  );
}

function Legend() {
  const t = useTranslations("floorPlan.devices.legend");
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground" aria-label={t("title")}>
      {(["none", "up", "degraded", "down", "repair"] as const).map((r) => (
        <li key={r} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded-full border-2", RING_CLASS[r])} aria-hidden />
          {t(r)}
        </li>
      ))}
    </ul>
  );
}

/** Chooses an asset to put on the plan: any with a body (not a virtual server or an application). */
export function PlaceDeviceDialog({ onPick, onClose }: { onPick: (a: Asset) => void; onClose: () => void }) {
  const t = useTranslations("floorPlan.devices");
  const lookups = useLookups();
  const { data: assets = [] } = useApi<Asset[]>("/assets");
  const choices = assets.filter((a) => a.status !== "retired" && deviceKind({ ...a, screenInches: null }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 sm:max-w-lg">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addHint")}</DialogDescription>
        </DialogHeader>
        <Command className="border-t">
          <CommandInput placeholder={t("searchAssets")} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t("noAssets")}</CommandEmpty>
            {choices.map((a) => {
              const kind = deviceKind({ ...a, screenInches: null }) ?? "other";
              const Icon = DEVICE_ICON[kind];
              return (
                <CommandItem key={a.id} value={`${a.name} ${a.room} ${a.id}`} onSelect={() => onPick(a)}>
                  <Icon className="text-muted-foreground" />
                  <span className="truncate">{a.name}</span>
                  <span className="ms-auto truncate text-xs text-muted-foreground">{[lookups.label("asset_type", a.type), a.room].filter(Boolean).join(" · ")}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
