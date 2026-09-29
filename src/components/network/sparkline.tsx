"use client";

import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";

const W = 96;
const H = 24;
const HOUR_MS = 3_600_000;

/**
 * Average response hour by hour. The line breaks where an hour had no reply, and a red tick
 * marks any hour with a failed check. Each hour has its own tooltip. Sized in rem, so it
 * follows the text size setting.
 */
export function Sparkline({ history, end }: { history: { latencyMs: number | null; failed: boolean }[]; end: number }) {
  const t = useTranslations("network");
  const format = useFormat();
  const step = W / history.length;
  const max = Math.max(1, ...history.map((h) => h.latencyMs ?? 0));
  const x = (i: number) => (i + 0.5) * step;
  const y = (ms: number) => H - 4 - (ms / max) * (H - 8);

  const runs: { i: number; ms: number }[][] = [[]];
  history.forEach((h, i) => {
    if (h.latencyMs === null) runs.push([]);
    else runs.at(-1)!.push({ i, ms: h.latencyMs });
  });
  const start = end - history.length * HOUR_MS;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-24 overflow-visible" role="img" aria-label={t("trendLabel")}>
      {runs
        .filter((run) => run.length > 0)
        .map((run) =>
          run.length === 1 ? (
            <circle key={run[0].i} cx={x(run[0].i)} cy={y(run[0].ms)} r={1.5} fill="var(--chart-1)" />
          ) : (
            <polyline
              key={run[0].i}
              points={run.map((p) => `${x(p.i)},${y(p.ms)}`).join(" ")}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ),
        )}
      {history.map((h, i) =>
        h.failed ? <rect key={`f${i}`} x={i * step + 0.5} y={H - 2} width={step - 1} height={2} rx={1} fill="var(--danger)" /> : null,
      )}
      {history.map((h, i) => (
        <rect key={i} x={i * step} y={0} width={step} height={H} fill="transparent">
          <title>
            {`${format.time(new Date(start + i * HOUR_MS))}: ${
              h.latencyMs === null ? t("noReply") : t("ms", { value: format.number(h.latencyMs) })
            }`}
          </title>
        </rect>
      ))}
    </svg>
  );
}
