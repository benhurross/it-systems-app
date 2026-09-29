import { daysBetween } from "./dates";
import type { AssetStatus, SupportStatus } from "./domain";

export const WARRANTY_WARNING_DAYS = 90;
export const REPLACEMENT_YEARS = 4;
/** The asset category code for laptops, desktops and the like. */
export const END_USER_CATEGORY = "end_user";

export type AssetFlags = {
  warrantyExpiring: boolean;
  warrantyExpired: boolean;
  unsupported: boolean;
  replacementDue: boolean;
};

export function assetFlags(
  asset: {
    category: string;
    status: AssetStatus;
    purchaseDate: string | null;
    warrantyEnd: string | null;
    supportStatus: SupportStatus;
  },
  today: string,
): AssetFlags {
  const live = asset.status !== "retired";
  const daysToWarranty = asset.warrantyEnd ? daysBetween(today, asset.warrantyEnd) : null;
  const ageYears = asset.purchaseDate ? daysBetween(asset.purchaseDate, today) / 365.25 : 0;
  return {
    warrantyExpiring: live && daysToWarranty !== null && daysToWarranty >= 0 && daysToWarranty <= WARRANTY_WARNING_DAYS,
    warrantyExpired: live && daysToWarranty !== null && daysToWarranty < 0,
    unsupported: live && (asset.supportStatus === "end_of_support" || asset.supportStatus === "end_of_life"),
    replacementDue: live && asset.category === END_USER_CATEGORY && ageYears >= REPLACEMENT_YEARS,
  };
}
