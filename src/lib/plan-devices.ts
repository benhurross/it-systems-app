/**
 * The assets shown on a floor plan: each drawn as what it is (a laptop, a TV, a server…), where it
 * was put on the plan, else in its room (where the drawing names it), else at the wall point it is
 * plugged into. Assets with no body (a virtual server, an application, a cloud service) are not shown.
 */

export type DeviceKind =
  | "laptop"
  | "desktop"
  | "monitor"
  | "tv"
  | "server"
  | "network"
  | "router"
  | "firewall"
  | "accessPoint"
  | "printer"
  | "camera"
  | "phone"
  | "ups"
  | "storage"
  | "other";

/** What an asset is on the plan, by its type (else its category); null when it has no body. */
export function deviceKind(a: { type: string; category: string; name?: string; screenInches?: number | null }): DeviceKind | null {
  switch (a.type) {
    case "laptop":
      return "laptop";
    case "desktop":
      return "desktop";
    case "monitor":
      // A large screen, or one named as a TV: a TV on its stand, else a monitor on a desk.
      return (a.screenInches ?? 0) >= 40 || /\b(tv|television|display)\b/i.test(a.name ?? "") ? "tv" : "monitor";
    case "physical_server":
      return "server";
    case "switch":
      return "network";
    case "router":
      return "router";
    case "firewall":
      return "firewall";
    case "access_point":
      return "accessPoint";
    case "printer":
    case "scanner":
      return "printer";
    case "cctv":
      return "camera";
    case "desk_phone":
      return "phone";
    case "ups":
      return "ups";
    case "storage":
    case "backup_appliance":
    case "nvr":
      return "storage";
    case "pbx":
    case "access_control":
      return "network";
    case "virtual_server":
    case "application":
    case "database":
    case "cloud_service":
      return null;
  }
  switch (a.category) {
    case "software":
    case "cloud":
      return null;
    case "end_user":
      return "desktop";
    case "servers":
      return "server";
    case "network":
      return "network";
    case "printers":
      return "printer";
    case "backup":
      return "storage";
    case "monitoring":
      return "camera";
    default:
      return "other";
  }
}

export type PlanDevice = {
  id: number;
  name: string;
  room: string;
  planX: number | null;
  planY: number | null;
  /** The wall point it is plugged into on this plan, if any. */
  outletId: number | null;
};

/** Where a device is drawn (fractions of the plan), and whether it was put there by hand. */
export type Placed<T> = T & { x: number; y: number; exact: boolean };

const key = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Where each device stands: put there by hand; else in its room, those in one room side by side
 * around the room's name; else at its wall point. Those with none of these are left out, to be placed.
 */
export function placeDevices<T extends PlanDevice>(
  devices: T[],
  rooms: { text: string; x: number; y: number }[],
  outlets: { id: number; x: number; y: number; room: string }[],
  /** The gap between devices in one room, in fractions of the plan. */
  gap = 0.012,
): { placed: Placed<T>[]; unplaced: T[] } {
  const placed: Placed<T>[] = [];
  const unplaced: T[] = [];
  const inRoom = new Map<string, number>();
  for (const d of devices) {
    if (d.planX !== null && d.planY !== null) {
      placed.push({ ...d, x: d.planX, y: d.planY, exact: true });
      continue;
    }
    // The room where the drawing names it, else where its outlets are said to be.
    const k = key(d.room);
    let spot: { x: number; y: number } | null = null;
    if (k) {
      const named = rooms.find((r) => key(r.text) === k);
      const marked = outlets.filter((o) => key(o.room) === k);
      if (named) spot = named;
      else if (marked.length) spot = { x: marked.reduce((s, o) => s + o.x, 0) / marked.length, y: marked.reduce((s, o) => s + o.y, 0) / marked.length };
    }
    if (spot) {
      // Side by side in rows of four, under the room's name, so none hides another.
      const n = inRoom.get(k) ?? 0;
      inRoom.set(k, n + 1);
      const col = (n % 4) - 1.5;
      const row = Math.floor(n / 4) + 1;
      placed.push({ ...d, x: clamp(spot.x + col * gap), y: clamp(spot.y + row * gap), exact: false });
      continue;
    }
    const outlet = d.outletId === null ? undefined : outlets.find((o) => o.id === d.outletId);
    if (outlet) placed.push({ ...d, x: clamp(outlet.x + gap * 0.6), y: clamp(outlet.y), exact: false });
    else unplaced.push(d);
  }
  return { placed, unplaced };
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** The room a spot on the plan is in: the nearest room name within `reach` (fractions), else null. */
export function roomAt(rooms: { text: string; x: number; y: number }[], at: { x: number; y: number }, reach = 0.08) {
  let best: { text: string; d: number } | null = null;
  for (const r of rooms) {
    const d = Math.hypot(r.x - at.x, r.y - at.y);
    if (d <= reach && (!best || d < best.d)) best = { text: r.text, d };
  }
  return best?.text ?? null;
}
