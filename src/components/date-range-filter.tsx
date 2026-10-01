"use client";

import { CalendarDays, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFormat } from "@/hooks/use-format";
import { DATE_PRESETS, type DateRange, isEmptyRange, presetOf, presetRange } from "@/lib/date-range";
import { isoDate } from "@/lib/dates";

/**
 * A range of days for a list: a quick choice (today, this month...) or chosen days, either end
 * open. The button says what is chosen.
 */
export function DateRangeFilter({ label, value, onChange }: { label: string; value: DateRange | null; onChange: (range: DateRange | null) => void }) {
  const t = useTranslations("table.dates");
  const format = useFormat();
  const titleId = useId();
  const fromId = useId();
  const toId = useId();
  const today = isoDate();
  const active = value && !isEmptyRange(value) ? value : null;
  const preset = active ? presetOf(active, today) : null;
  const summary = !active
    ? null
    : preset
      ? t(`presets.${preset}`)
      : active.from && active.to
        ? t("between", { from: format.date(active.from), to: format.date(active.to) })
        : active.from
          ? t("since", { date: format.date(active.from) })
          : t("until", { date: format.date(active.to!) });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed">
          <CalendarDays />
          {label}
          {summary && (
            <Badge variant="secondary" className="rounded-sm px-1.5 font-normal">
              {summary}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3" aria-labelledby={titleId}>
        <p id={titleId} className="text-sm font-medium">
          {label}
        </p>
        <div className="grid grid-cols-2 gap-1" role="group" aria-label={t("quick")}>
          {DATE_PRESETS.map((p) => (
            <Button
              key={p}
              variant={preset === p ? "secondary" : "ghost"}
              size="sm"
              className="justify-start"
              aria-pressed={preset === p}
              onClick={() => onChange({ ...presetRange(p, today), preset: p })}
            >
              {t(`presets.${p}`)}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor={fromId}>{t("from")}</Label>
            <Input
              id={fromId}
              type="date"
              dir="ltr"
              value={active?.from ?? ""}
              max={active?.to ?? undefined}
              onChange={(e) => onChange({ from: e.target.value || null, to: active?.to ?? null })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={toId}>{t("to")}</Label>
            <Input
              id={toId}
              type="date"
              dir="ltr"
              value={active?.to ?? ""}
              min={active?.from ?? undefined}
              onChange={(e) => onChange({ from: active?.from ?? null, to: e.target.value || null })}
            />
          </div>
        </div>
        {active && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X />
            {t("clear")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
