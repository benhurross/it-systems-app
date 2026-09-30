"use client";

import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useFormat } from "@/hooks/use-format";
import type { DashboardData } from "@/lib/api-types";
import { ChartCard, ChartTable, LegendKey } from "./chart-card";

/** Tickets opened and closed each month. Time runs left to right in both languages, as axes do. */
export function TicketsChart({ months }: { months: DashboardData["charts"]["ticketsByMonth"] }) {
  const t = useTranslations("dashboard.charts");
  const format = useFormat();
  const locale = useLocale();
  const monthName = (month: string, style: "short" | "long") =>
    new Intl.DateTimeFormat(locale, { month: style, year: style === "long" ? "numeric" : undefined, timeZone: "UTC" }).format(
      new Date(`${month}-01T00:00:00Z`),
    );
  const config = {
    opened: { label: t("opened"), color: "var(--chart-1)" },
    closed: { label: t("closed"), color: "var(--chart-2)" },
  } satisfies ChartConfig;
  const last = months.length - 1;
  const endLabel = ({ x, y, index, value }: { x?: number | string; y?: number | string; index?: number; value?: unknown }) =>
    index === last ? (
      <text x={Number(x) + 8} y={Number(y)} dy="0.32em" className="fill-muted-foreground text-xs tabular-nums">
        {format.number(Number(value))}
      </text>
    ) : null;

  return (
    <ChartCard
      title={t("tickets")}
      description={t("lastYear")}
      legend={
        <div className="flex flex-wrap gap-4">
          <LegendKey color="var(--chart-1)" label={t("opened")} shape="line" />
          <LegendKey color="var(--chart-2)" label={t("closed")} shape="line" />
        </div>
      }
      table={
        <ChartTable
          head={[t("month"), t("opened"), t("closed")]}
          rows={months.map((m) => [monthName(m.month, "long"), format.number(m.opened), format.number(m.closed)])}
        />
      }
    >
      <div dir="ltr">
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <LineChart data={months} margin={{ top: 8, right: 36, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(m: string) => monthName(m, "short")} minTickGap={8} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => format.number(v)} />
            <ChartTooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={<ChartTooltipContent indicator="line" labelFormatter={(_, payload) => monthName(String(payload[0]?.payload?.month), "long")} />}
            />
            {(["opened", "closed"] as const).map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                label={endLabel}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </div>
    </ChartCard>
  );
}
