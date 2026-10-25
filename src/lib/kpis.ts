import { isoDate } from "./dates";

/** The quarter a moment falls in, in the app's time zone, with its year. */
export function quarterOf(at: Date | string): { year: number; quarter: number } {
  const [year, month] = isoDate(at).split("-").map(Number);
  return { year, quarter: Math.ceil(month / 3) };
}
