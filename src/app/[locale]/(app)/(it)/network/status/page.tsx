"use client";

import { CircleAlert, CircleCheck, Gauge, Network, PauseCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { AlertsPanel } from "@/components/network/alerts-panel";
import { NetworkHeader } from "@/components/network/network-header";
import { Sparkline } from "@/components/network/sparkline";
import { StatCard } from "@/components/stat-card";
import { Alert as Notice, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Alert, Device, NetworkStatus } from "@/lib/api-types";
import { DEVICE_STATUSES, type DeviceStatus } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const col = columnHelper<Device>();
/** Trouble first. */
const SEVERITY: Record<DeviceStatus, number> = { down: 0, degraded: 1, unknown: 2, up: 3 };

export default function NetworkStatusPage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const user = useCurrentUser();
  const { data, isLoading, dataUpdatedAt } = useApi<NetworkStatus>("/network", { refetchInterval: 10_000 });
  const { data: alerts = [] } = useApi<Alert[]>("/alerts", { refetchInterval: 10_000 });
  const check = useApiMutation(
    async (device: Device) => ({ name: device.name, ...(await api<{ status: DeviceStatus }>(`/network/${device.id}/check`, { method: "POST" })) }),
    { onSuccess: ({ name, status }) => toast.success(t("network.checked", { name, status: t(`enums.deviceStatus.${status}`) })) },
  );
  const devices = (data?.devices ?? []).toSorted(
    (a, b) => SEVERITY[a.monitorStatus] - SEVERITY[b.monitorStatus] || a.name.localeCompare(b.name),
  );
  const count = (status: DeviceStatus) => devices.filter((d) => d.monitorStatus === status).length;

  const columns = [
    col.accessor("name", {
      header: t("network.device"),
      cell: (info) => (
        <div className="min-w-0">
          <Link href={`/assets/${info.row.original.id}`} className="font-medium hover:text-primary">
            {info.getValue()}
          </Link>
          <p dir="ltr" className="text-start font-mono text-xs text-muted-foreground">
            {info.row.original.ipAddress}
          </p>
        </div>
      ),
    }),
    col.accessor("location", { header: t("assets.location"), filterFn: "arrHas", cell: (info) => lookups.label("location", info.getValue()) }),
    col.accessor("monitorMethod", {
      header: t("network.method"),
      enableSorting: false,
      cell: (info) =>
        info.getValue() === "tcp" ? `${t("enums.monitorMethod.tcp")} ${info.row.original.monitorPort}` : t("enums.monitorMethod.ping"),
    }),
    col.accessor("monitorStatus", {
      header: t("network.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="deviceStatus" value={info.getValue()} />,
    }),
    col.accessor("monitorLatencyMs", {
      header: t("network.latency"),
      cell: (info) =>
        info.getValue() === null ? "—" : <span className="tabular-nums">{t("network.ms", { value: format.number(info.getValue()!) })}</span>,
    }),
    col.accessor("availability", {
      header: t("network.availability"),
      cell: (info) => (info.getValue() === null ? "—" : <span className="tabular-nums">{format.percent(info.getValue()!)}</span>),
    }),
    col.display({
      id: "trend",
      header: t("network.trend"),
      cell: (info) => <Sparkline history={info.row.original.history} end={dataUpdatedAt} />,
    }),
    col.accessor("monitorCheckedAt", {
      header: t("network.lastCheck"),
      cell: (info) =>
        info.getValue() ? (
          <span className="whitespace-nowrap">{format.relative(info.getValue()!)}</span>
        ) : (
          <span className="text-muted-foreground">{t("network.never")}</span>
        ),
    }),
    col.display({
      id: "check",
      header: () => <span className="sr-only">{t("common.actions")}</span>,
      cell: (info) => {
        const device = info.row.original;
        const busy = check.isPending && check.variables?.id === device.id;
        return (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("network.checkNow", { name: device.name })}
            onClick={() => check.mutate(device)}
            disabled={busy}
          >
            <RefreshCw className={cn(busy && "animate-spin")} />
          </Button>
        );
      },
    }),
  ];

  return (
    <>
      <NetworkHeader />
      {data && !data.enabled && (
        <Notice className="mb-6">
          <PauseCircle />
          <AlertTitle>{t("network.paused")}</AlertTitle>
          <AlertDescription>
            {can(user.role, "settings") ? (
              <Link href="/settings/monitoring" className="font-medium text-primary hover:underline">
                {t("network.pausedAdmin")}
              </Link>
            ) : (
              t("network.pausedStaff")
            )}
          </AlertDescription>
        </Notice>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Network}
          label={t("network.summary.monitored")}
          value={format.number(devices.length)}
          hint={data?.enabled ? t("network.running", { seconds: format.number(data.intervalSeconds) }) : undefined}
        />
        <StatCard icon={CircleCheck} label={t("network.summary.up")} value={format.number(count("up"))} />
        <StatCard icon={CircleAlert} label={t("network.summary.down")} value={format.number(count("down"))} />
        <StatCard icon={Gauge} label={t("network.summary.degraded")} value={format.number(count("degraded"))} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {!isLoading && devices.length === 0 ? (
            <EmptyState icon={Network} title={t("network.noDevices")} description={t("network.noDevicesHint")} />
          ) : (
            <DataTable
              data={devices}
              columns={columns}
              loading={isLoading}
              pageSize={25}
              facets={[
                {
                  column: "monitorStatus",
                  label: t("network.status"),
                  options: DEVICE_STATUSES.map((s) => ({ value: s, label: t(`enums.deviceStatus.${s}`) })),
                },
                { column: "location", label: t("assets.location"), options: lookups.options("location") },
              ]}
            />
          )}
        </div>
        <AlertsPanel alerts={alerts} />
      </div>
    </>
  );
}
