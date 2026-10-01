import { addDays, isoDate } from "./dates";

/** A range of days, both ends included, as YYYY-MM-DD; either end may be open. A quick range keeps its name. */
export type DateRange = { from: string | null; to: string | null; preset?: DatePreset };

export const DATE_PRESETS = ["today", "last7", "last30", "thisMonth", "lastMonth", "thisYear", "lastYear"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

/** The days a preset covers, counted from `today`. */
export function presetRange(preset: DatePreset, today = isoDate()): { from: string; to: string } {
  const monthStart = `${today.slice(0, 8)}01`;
  const year = Number(today.slice(0, 4));
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: monthStart, to: today };
    case "lastMonth": {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    case "thisYear":
      return { from: `${year}-01-01`, to: today };
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  }
}

/** The preset a range is, if it is one, for naming it: the one chosen, when two cover the same days. */
export function presetOf(range: DateRange, today = isoDate()): DatePreset | null {
  const matches = (p: DatePreset) => {
    const r = presetRange(p, today);
    return r.from === range.from && r.to === range.to;
  };
  if (range.preset && matches(range.preset)) return range.preset;
  return DATE_PRESETS.find(matches) ?? null;
}

export const isEmptyRange = (range: DateRange | null | undefined) => !range || (!range.from && !range.to);

/** Whether a moment falls on a day in the range, by the office's calendar. Ends given backwards still work. */
export function inDateRange(at: Date | string, range: DateRange): boolean {
  const day = isoDate(at);
  const [from, to] = range.from && range.to && range.from > range.to ? [range.to, range.from] : [range.from, range.to];
  return (!from || day >= from) && (!to || day <= to);
}
