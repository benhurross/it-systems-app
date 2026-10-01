export const TIME_ZONE = "Asia/Riyadh";

// Both languages use the Gregorian calendar and Latin digits; ar-SA would otherwise default to Hijri.
const INTL_LOCALE: Record<string, string> = {
  en: "en-GB",
  ar: "ar-SA-u-ca-gregory-nu-latn",
};

const intl = (locale: string) => INTL_LOCALE[locale] ?? INTL_LOCALE.en;
const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

// Making a formatter loads locale and time zone data, which takes far longer than using one:
// thousands of dates (a long table, a year of tickets) made the pages slow. Each is made once.
const formatters = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>();
function kept<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>(key: string, make: () => T): T {
  let formatter = formatters.get(key) as T | undefined;
  if (!formatter) {
    formatter = make();
    formatters.set(key, formatter);
  }
  return formatter;
}

/** A date formatter for these settings, made the first time it is asked for. */
export const dateFormatter = (locale: string, options?: Intl.DateTimeFormatOptions) =>
  kept(`date|${locale}|${JSON.stringify(options ?? {})}`, () => new Intl.DateTimeFormat(locale, options));

/** A number formatter for these settings, made the first time it is asked for. */
export const numberFormatter = (locale: string, options?: Intl.NumberFormatOptions) =>
  kept(`number|${locale}|${JSON.stringify(options ?? {})}`, () => new Intl.NumberFormat(locale, options));

// Month names rather than digits, so 03/04 is never read two ways.
const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE };

export function formatDate(value: Date | string, locale: string) {
  return dateFormatter(intl(locale), DATE).format(toDate(value));
}

export function formatDateTime(value: Date | string, locale: string) {
  return dateFormatter(intl(locale), { ...DATE, hour: "2-digit", minute: "2-digit" }).format(toDate(value));
}

export function formatTime(value: Date | string, locale: string) {
  return dateFormatter(intl(locale), { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(toDate(value));
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions) {
  return numberFormatter(intl(locale), options).format(value);
}

export function formatCurrency(value: number, locale: string) {
  return formatNumber(value, locale, { style: "currency", currency: "SAR", maximumFractionDigits: 0 });
}

/** `ratio` is 0..1. */
export function formatPercent(ratio: number, locale: string) {
  return formatNumber(ratio, locale, { style: "percent", maximumFractionDigits: 1 });
}

/** A span of hours as minutes, hours or days, whichever reads best. */
export function formatHours(hours: number, locale: string) {
  const unit = (value: number, name: "minute" | "hour" | "day") =>
    formatNumber(value, locale, { style: "unit", unit: name, unitDisplay: "narrow", maximumFractionDigits: 1 });
  const abs = Math.abs(hours);
  if (abs < 1) return unit(Math.round(hours * 60), "minute");
  if (abs < 48) return unit(hours, "hour");
  return unit(hours / 24, "day");
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "in 3 hours", "2 days ago". */
export function formatRelative(value: Date | string, now: Date, locale: string) {
  const seconds = (toDate(value).getTime() - now.getTime()) / 1000;
  const rtf = kept(`relative|${intl(locale)}`, () => new Intl.RelativeTimeFormat(intl(locale), { numeric: "auto" }));
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds), "second");
}
