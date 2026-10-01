import { dateFormatter, TIME_ZONE } from "./format";

const DAY_MS = 86_400_000;

/** The calendar date in Riyadh, as YYYY-MM-DD. */
export function isoDate(at: Date | string = new Date()): string {
  return dateFormatter("en-CA", { timeZone: TIME_ZONE }).format(new Date(at));
}

const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

export const hoursBetween = (from: Date | string, to: Date | string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
