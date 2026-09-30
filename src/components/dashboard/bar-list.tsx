/**
 * Horizontal bars drawn in HTML: they follow the page direction, scale with the text size and
 * keep every label readable. Each bar is thin, rounded at its data end and valued at its tip.
 * `bars` holds one or more measures per row, all drawn against the same scale.
 */
export function BarList({
  rows,
  bars,
}: {
  rows: { key: string; label: string; values: number[]; display: string[] }[];
  bars: { color: string; name: string }[];
}) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(6rem,38%)_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
          <span className="text-sm leading-tight [overflow-wrap:anywhere]">{row.label}</span>
          <div className="space-y-0.5">
            {bars.map((bar, i) => (
              <div key={bar.name} className="flex items-center gap-2">
                <span
                  className="h-2.5 min-w-0.5 rounded-e-[4px]"
                  style={{ width: `${(row.values[i] / max) * 85}%`, background: bar.color }}
                  aria-hidden
                />
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {bars.length > 1 && <span className="sr-only">{bar.name}: </span>}
                  {row.display[i]}
                </span>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
