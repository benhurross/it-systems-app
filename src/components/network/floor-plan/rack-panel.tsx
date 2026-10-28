"use client";

import { Hint } from "@/components/hint";
import { useTranslations } from "next-intl";
import { EnumBadge } from "@/components/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FloorPlan } from "@/lib/api-types";
import type { DeviceStatus } from "@/lib/domain";
import { cn } from "@/lib/utils";

const LED: Record<DeviceStatus, string> = { up: "#16a34a", degraded: "#f59e0b", down: "#dc2626", unknown: "#94a3b8" };

/** A switch's front, 1U: two rows of ports and its status light. */
function SwitchFace({ status }: { status: DeviceStatus | null }) {
  return (
    <svg viewBox="0 0 120 26" className="h-7 w-[120px] shrink-0" aria-hidden>
      <rect x="0.5" y="0.5" width="119" height="25" rx="2.5" fill="#1f2937" stroke="#0f172a" />
      <rect x="3" y="3" width="2" height="20" rx="1" fill="#4b5563" />
      <rect x="115" y="3" width="2" height="20" rx="1" fill="#4b5563" />
      <circle cx="12" cy="13" r="3" fill={LED[status ?? "unknown"]} />
      {Array.from({ length: 24 }, (_, i) => {
        const col = i % 12;
        const x = 22 + col * 7.2 + (col >= 6 ? 3 : 0);
        return <rect key={i} x={x} y={i < 12 ? 5 : 14} width="5.6" height="6.5" rx="0.8" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.4" />;
      })}
    </svg>
  );
}

/** A patch panel's front, 1U: a row of numbered jacks. */
function PanelFace() {
  return (
    <svg viewBox="0 0 120 26" className="h-7 w-[120px] shrink-0" aria-hidden>
      <rect x="0.5" y="0.5" width="119" height="25" rx="2.5" fill="#d1d5db" stroke="#6b7280" />
      <rect x="3" y="3" width="2" height="20" rx="1" fill="#9ca3af" />
      <rect x="115" y="3" width="2" height="20" rx="1" fill="#9ca3af" />
      {Array.from({ length: 24 }, (_, i) => {
        const col = i % 12;
        const x = 10 + col * 8.4 + (col >= 6 ? 2 : 0);
        return (
          <g key={i}>
            <rect x={x} y={i < 12 ? 4 : 14} width="6" height="7" rx="0.8" fill="#111827" />
            <rect x={x + 1.5} y={i < 12 ? 4 : 14} width="3" height="1.4" fill="#4b5563" />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The server room's rack as it stands: the patch panels over the switches, each a button that
 * shows (and traces) every outlet wired to it, pressed while it is shown.
 */
export function RackPanel({
  plan,
  panelNo,
  switchNo,
  onPanel,
  onSwitch,
}: {
  plan: FloorPlan;
  panelNo: number | null;
  switchNo: number | null;
  onPanel: (n: number | null) => void;
  onSwitch: (n: number | null) => void;
}) {
  const t = useTranslations("floorPlan");
  const ports = (n: number) => plan.outlets.filter((o) => o.panel === n).length;
  const unit = (active: boolean) =>
    cn(
      "flex w-full items-center gap-3 rounded-lg border bg-background p-2 text-start transition-colors hover:border-primary/50 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      active && "border-2 border-orange-500 bg-orange-50 hover:border-orange-500 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-950/60",
    );
  if (!plan.panels.length && !plan.switches.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("rack.title")}
          <Hint className="ms-1">{t("rack.hint")}</Hint>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan.panels.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-sm font-medium">{t("panels")}</h3>
            {plan.panels.map((n) => (
              <button key={n} type="button" aria-pressed={panelNo === n} className={unit(panelNo === n)} onClick={() => onPanel(panelNo === n ? null : n)}>
                <PanelFace />
                <span className="min-w-0 flex-1 text-sm">
                  <span dir="ltr" className="block font-mono font-semibold">
                    P{n}
                  </span>
                  <span className="block text-xs text-muted-foreground">{t("outlets", { count: ports(n) })}</span>
                </span>
              </button>
            ))}
          </section>
        )}
        {plan.switches.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-sm font-medium">{t("switches")}</h3>
            {plan.switches.map((s) => (
              <button key={s.number} type="button" aria-pressed={switchNo === s.number} className={unit(switchNo === s.number)} onClick={() => onSwitch(switchNo === s.number ? null : s.number)}>
                <SwitchFace status={s.asset?.monitorStatus ?? null} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span dir="ltr" className="font-mono font-semibold">
                      S{s.number}
                    </span>
                    {s.asset && <EnumBadge kind="deviceStatus" value={s.asset.monitorStatus} />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{s.asset ? s.asset.name : t("rack.notLinked")}</span>
                  <span className="block text-xs text-muted-foreground">{t("outlets", { count: s.ports })}</span>
                </span>
              </button>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
