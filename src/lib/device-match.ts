/**
 * Matching a PC that reported itself at sign-in to the inventory: by serial number first (it stays
 * the same when the PC is renamed or Windows is reinstalled), then by MAC, then by name.
 */

/** What many PCs give as a serial number when the maker left it blank. */
const PLACEHOLDERS = /^(to be filled by o\.?e\.?m\.?|default string|system serial number|none|n\/a|not specified|not applicable|chassis serial number|serial|0+|1234567890|123456789|x+)$/i;

/** A serial number worth matching on, or null for a blank or placeholder one. */
export function cleanSerial(serial: string | null | undefined) {
  const s = serial?.trim() ?? "";
  return s.length >= 3 && !PLACEHOLDERS.test(s) ? s : null;
}

/** A MAC as twelve hex digits, written aa:bb:cc:dd:ee:ff; null for anything else. */
export function cleanMac(mac: string | null | undefined) {
  const hex = mac?.toLowerCase().replace(/[^0-9a-f]/g, "") ?? "";
  if (hex.length !== 12 || /^0+$/.test(hex) || /^f+$/.test(hex)) return null;
  return hex.match(/../g)!.join(":");
}

/** The address a request came from, as Next.js passes it on: the first of the forwarded ones. */
export function requestIp(headers: Headers) {
  const raw = (headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "").split(",")[0].trim();
  const ip = raw.replace(/^::ffff:/, "");
  return /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip : null;
}

/** The key a PC's report is kept under: its serial, else its MAC, else its name. */
export const deviceKey = (d: { serial: string | null; mac: string | null; computerName: string }) =>
  d.serial ? `serial:${d.serial.toLowerCase()}` : d.mac ? `mac:${d.mac}` : `name:${d.computerName.toLowerCase()}`;

type InventoryItem = { id: number; name: string; serial: string | null; macAddress: string | null };

/** The asset a PC is, and how it was told. */
export function matchDevice(device: { serial: string | null; mac: string | null; computerName: string }, assets: InventoryItem[]) {
  if (device.serial) {
    const bySerial = assets.find((a) => cleanSerial(a.serial)?.toLowerCase() === device.serial!.toLowerCase());
    if (bySerial) return { assetId: bySerial.id, matchedBy: "serial" as const };
  }
  if (device.mac) {
    const byMac = assets.find((a) => cleanMac(a.macAddress) === device.mac);
    if (byMac) return { assetId: byMac.id, matchedBy: "mac" as const };
  }
  const byName = assets.find((a) => a.name.trim().toLowerCase() === device.computerName.trim().toLowerCase());
  return byName ? { assetId: byName.id, matchedBy: "name" as const } : { assetId: null, matchedBy: null };
}

/** What differs between what the PC says and what the inventory has. */
export function deviceChanges(device: { computerName: string; ip: string | null; mac: string | null }, asset: { name: string; ipAddress: string | null; macAddress: string | null } | null) {
  if (!asset) return { notInInventory: true, name: false, ip: false, mac: false };
  return {
    notInInventory: false,
    name: asset.name.trim().toLowerCase() !== device.computerName.trim().toLowerCase(),
    ip: !!device.ip && asset.ipAddress !== device.ip,
    mac: !!device.mac && cleanMac(asset.macAddress) !== device.mac,
  };
}
