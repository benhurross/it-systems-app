import { useLocale } from "next-intl";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatHours,
  formatNumber,
  formatPercent,
  formatRelative,
} from "@/lib/format";

/** Formatters bound to the current locale. */
export function useFormat() {
  const locale = useLocale();
  return {
    date: (value: Date | string) => formatDate(value, locale),
    dateTime: (value: Date | string) => formatDateTime(value, locale),
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, locale, options),
    currency: (value: number) => formatCurrency(value, locale),
    percent: (ratio: number) => formatPercent(ratio, locale),
    hours: (hours: number) => formatHours(hours, locale),
    relative: (value: Date | string, now = new Date()) => formatRelative(value, now, locale),
  };
}
