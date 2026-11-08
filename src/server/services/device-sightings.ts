import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { cleanMac, cleanSerial, deviceChanges, deviceKey, matchDevice } from "@/lib/device-match";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, deviceSightings } from "../db/schema";
import { badRequest, one } from "../http";

/**
 * PCs as they describe themselves when someone signs in to Windows (the sign-in script), matched
 * to the inventory so a PC renamed, readdressed or never recorded shows in Asset Discovery.
 * Only the latest report of each PC is kept.
 */

const inventory = () => db.select({ id: assets.id, name: assets.name, serial: assets.serial, macAddress: assets.macAddress }).from(assets);

/** Records what a PC said at sign-in, and the address it came from; gives back that address. */
export async function recordSighting(report: { computer: string; upn: string; user: string; serial?: string; mac?: string }, ip: string | null, now = new Date()) {
  const device = { computerName: report.computer.trim(), serial: cleanSerial(report.serial), mac: cleanMac(report.mac) };
  const match = matchDevice(device, await inventory());
  const values = { ...device, ip, account: report.upn || report.user, assetId: match.assetId, matchedBy: match.matchedBy, seenAt: now };
  const key = deviceKey(device);
  await db.insert(deviceSightings).values({ deviceKey: key, ...values }).onConflictDoUpdate({ target: deviceSightings.deviceKey, set: values });
  // The same PC reported before with less to go on (by name, or by MAC): that report gives way.
  const weaker = [`name:${device.computerName.toLowerCase()}`, ...(device.mac ? [`mac:${device.mac}`] : [])];
  await db.delete(deviceSightings).where(and(inArray(deviceSightings.deviceKey, weaker), ne(deviceSightings.deviceKey, key)));
  return { ip, computer: device.computerName };
}

/** Every PC seen, latest first, with its asset and what differs from it. PCs not yet matched are tried again. */
export async function listSightings() {
  const unmatched = await db.select().from(deviceSightings).where(isNull(deviceSightings.assetId));
  if (unmatched.length) {
    const items = await inventory();
    for (const s of unmatched) {
      const match = matchDevice(s, items);
      if (match.assetId) await db.update(deviceSightings).set(match).where(eq(deviceSightings.id, s.id));
    }
  }
  const rows = await db
    .select({ sighting: deviceSightings, asset: { id: assets.id, name: assets.name, ipAddress: assets.ipAddress, macAddress: assets.macAddress, serial: assets.serial } })
    .from(deviceSightings)
    .leftJoin(assets, eq(assets.id, deviceSightings.assetId))
    .orderBy(desc(deviceSightings.seenAt));
  return rows.map(({ sighting, asset }) => ({ ...sighting, asset: asset?.id ? asset : null, changes: deviceChanges(sighting, asset?.id ? asset : null) }));
}

/** The latest a PC said of itself, for its asset's page. */
export async function sightingOfAsset(assetId: number) {
  const [row] = await db.select().from(deviceSightings).where(eq(deviceSightings.assetId, assetId)).orderBy(desc(deviceSightings.seenAt)).limit(1);
  return row ?? null;
}

const FIELDS = ["name", "ip", "mac", "serial"] as const;
export type SightingField = (typeof FIELDS)[number];

/** Takes into the asset what the PC said: its name, address, MAC or serial, as IT chooses. */
export async function applySighting(id: number, fields: SightingField[], actor: Actor) {
  const s = one(await db.select().from(deviceSightings).where(eq(deviceSightings.id, id)));
  if (!s.assetId) throw badRequest("Not in the inventory");
  const asset = one(await db.select().from(assets).where(eq(assets.id, s.assetId)));
  const set: Partial<typeof assets.$inferInsert> = {};
  if (fields.includes("name")) set.name = s.computerName;
  if (fields.includes("ip") && s.ip) set.ipAddress = s.ip;
  if (fields.includes("mac") && s.mac) set.macAddress = s.mac;
  if (fields.includes("serial") && s.serial) set.serial = s.serial;
  if (!Object.keys(set).length) return { id: asset.id };
  await db.update(assets).set(set).where(eq(assets.id, asset.id));
  const said = Object.entries(set).map(([k, v]) => `${k} ${String(asset[k as keyof typeof asset] ?? "—")} → ${v}`);
  await audit(actor, "update", "asset", asset.id, `Updated ${asset.name} from the PC's sign-in report: ${said.join(", ")}`);
  return { id: asset.id };
}

export const SIGHTING_FIELDS = FIELDS;
