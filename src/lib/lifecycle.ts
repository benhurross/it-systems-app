import { daysBetween } from "./dates";
import type { AssetStatus, SupportStatus } from "./domain";

export const WARRANTY_WARNING_DAYS = 90;
/** The asset category code for laptops, desktops and the like. */
export const END_USER_CATEGORY = "end_user";

export type AssetFlags = {
  warrantyExpiring: boolean;
  warrantyExpired: boolean;
  unsupported: boolean;
  replacementDue: boolean;
};

/**
 * What needs looking at in an asset. Due for replacement only once IT has confirmed it is beyond
 * repair: age alone says nothing, since a laptop or desktop has parts that are replaced and upgraded.
 */
export function assetFlags(
  asset: {
    status: AssetStatus;
    beyondRepairAt?: string | Date | null;
    purchaseDate: string | null;
    warrantyEnd: string | null;
    supportStatus: SupportStatus;
  },
  today: string,
): AssetFlags {
  const live = asset.status !== "retired";
  const daysToWarranty = asset.warrantyEnd ? daysBetween(today, asset.warrantyEnd) : null;
  return {
    warrantyExpiring: live && daysToWarranty !== null && daysToWarranty >= 0 && daysToWarranty <= WARRANTY_WARNING_DAYS,
    warrantyExpired: live && daysToWarranty !== null && daysToWarranty < 0,
    unsupported: live && (asset.supportStatus === "end_of_support" || asset.supportStatus === "end_of_life"),
    replacementDue: live && !!asset.beyondRepairAt,
  };
}
