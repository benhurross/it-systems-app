"use client";

import { useTranslations } from "next-intl";
import { SCALE } from "@/components/risk/dialogs";
import type { Severity } from "@/lib/domain";
import { riskLevel, riskScore } from "@/lib/risk";
import { cn } from "@/lib/utils";

export type Cell = { likelihood: number; impact: number };

const LEVEL_STYLE: Record<Severity, string> = {
  low: "bg-success-soft text-success",
  medium: "bg-warning-soft text-warning",
  high: "bg-danger-soft text-danger",
  critical: "bg-danger text-background",
};
const LEVELS: Severity[] = ["low", "medium", "high", "critical"];

/**
 * The 5x5 matrix: likelihood up the side, impact along the bottom, each square coloured by the
 * level its score falls in and showing how many open risks sit there. Pressing a square filters
 * the register to it. Always laid out left to right, like any chart.
 */
export function Heatmap({
  risks,
  selected,
  onSelect,
}: {
  risks: Cell[];
  selected: Cell | null;
  onSelect: (cell: Cell | null) => void;
}) {
  const t = useTranslations();
  const count = (likelihood: number, impact: number) =>
    risks.filter((r) => r.likelihood === likelihood && r.impact === impact).length;

  return (
    <figure dir="ltr" className="space-y-3">
      <figcaption className="sr-only">{t("risk.heatmap")}</figcaption>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <div className="flex items-center">
          <span className="text-xs font-medium text-muted-foreground [writing-mode:vertical-rl] rotate-180">{t("risk.likelihood")}</span>
        </div>
        <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1">
          {[...SCALE].reverse().map((likelihood) => (
            <div key={likelihood} className="contents">
              <span className="grid w-5 place-items-center text-xs text-muted-foreground">{likelihood}</span>
              {SCALE.map((impact) => {
                const n = count(likelihood, impact);
                const level = riskLevel(riskScore(likelihood, impact));
                const active = selected?.likelihood === likelihood && selected.impact === impact;
                const label = `${t("risk.cell", { likelihood: String(likelihood), impact: String(impact), count: String(n) })} (${t(`enums.severity.${level}`)})`;
                return (
                  <button
                    key={impact}
                    type="button"
                    aria-pressed={active}
                    aria-label={label}
                    title={label}
                    onClick={() => onSelect(active ? null : { likelihood, impact })}
                    className={cn(
                      "grid aspect-[4/3] min-h-9 w-full min-w-0 place-items-center rounded-md text-sm font-semibold tabular-nums transition-[box-shadow,opacity] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      LEVEL_STYLE[level],
                      n === 0 && "opacity-45",
                      active && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                    )}
                  >
                    {n > 0 ? n : ""}
                  </button>
                );
              })}
            </div>
          ))}
          <span />
          {SCALE.map((impact) => (
            <span key={impact} className="text-center text-xs text-muted-foreground">
              {impact}
            </span>
          ))}
        </div>
      </div>
      <p className="text-center text-xs font-medium text-muted-foreground">{t("risk.impact")}</p>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-sm", LEVEL_STYLE[level])} />
            {t(`enums.severity.${level}`)}
          </li>
        ))}
      </ul>
    </figure>
  );
}
