import { daysBetween } from "./dates";

export const LICENSE_STATES = ["compliant", "expiring", "expired", "over_deployed"] as const;
export type LicenseState = (typeof LICENSE_STATES)[number];
export const EXPIRY_WARNING_DAYS = 60;

/** Over-deployment is checked first: installing beyond the seats bought is the audit finding. */
export function licenseState(
  license: { seats: number; expiryDate: string | null },
  installs: number,
  today: string,
): LicenseState {
  if (installs > license.seats) return "over_deployed";
  if (license.expiryDate && license.expiryDate < today) return "expired";
  if (license.expiryDate && daysBetween(today, license.expiryDate) <= EXPIRY_WARNING_DAYS) return "expiring";
  return "compliant";
}

/** Share of licences that are neither over-deployed nor expired. */
export function compliance(states: LicenseState[]): number | null {
  if (states.length === 0) return null;
  return states.filter((s) => s === "compliant" || s === "expiring").length / states.length;
}
