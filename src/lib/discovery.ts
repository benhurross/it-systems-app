/** Ports probed on every address: SSH, HTTP, HTTPS, SMB, RDP and raw printing. */
export const DISCOVERY_PORTS = [22, 80, 443, 445, 3389, 9100] as const;
export const MAX_PREFIX = 24;

const OCTETS = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/**
 * The host addresses in an IPv4 CIDR block, capped at /24 so a sweep stays a few hundred probes.
 * Network and broadcast addresses are left out, except in /31 and /32 where every address is a host.
 */
export function expandCidr(cidr: string): string[] {
  const match = cidr.trim().match(OCTETS);
  if (!match) throw new Error("Enter an IPv4 range such as 192.168.1.0/24");
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((o) => o > 255) || prefix > 32) throw new Error("That is not a valid IPv4 range");
  if (prefix < MAX_PREFIX) throw new Error(`Ranges larger than /${MAX_PREFIX} are not scanned`);

  const base = (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0) & (~0 << (32 - prefix));
  const size = 2 ** (32 - prefix);
  const [first, last] = size <= 2 ? [0, size - 1] : [1, size - 2];
  const hosts: string[] = [];
  for (let i = first; i <= last; i++) {
    const n = (base + i) >>> 0;
    hosts.push([24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join("."));
  }
  return hosts;
}

const ARP_LINE = /(\d{1,3}(?:\.\d{1,3}){3})\D+?([0-9a-f]{2}([-:])[0-9a-f]{2}(?:\3[0-9a-f]{2}){4})/i;

/** IP-to-MAC pairs from `arp -a` output, on Windows ("aa-bb-...") or Linux and macOS ("aa:bb:..."). */
export function parseArp(output: string): Map<string, string> {
  const table = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(ARP_LINE);
    if (match && !/^ff[-:]ff/i.test(match[2])) table.set(match[1], match[2].toLowerCase().replaceAll("-", ":"));
  }
  return table;
}

export type HostState = "registered" | "new" | "ip_changed";

const normalizeMac = (mac: string | null) => mac?.toLowerCase().replace(/[^0-9a-f]/g, "") || null;

/** Matches a found host to inventory: by MAC first, since addresses move, then by IP. */
export function reconcile(
  host: { ip: string; mac: string | null },
  assets: { id: number; ipAddress: string | null; macAddress: string | null }[],
): { state: HostState; assetId: number | null } {
  const mac = normalizeMac(host.mac);
  const byMac = mac ? assets.find((a) => normalizeMac(a.macAddress) === mac) : undefined;
  if (byMac) return { state: byMac.ipAddress === host.ip ? "registered" : "ip_changed", assetId: byMac.id };
  const byIp = assets.find((a) => a.ipAddress === host.ip);
  return byIp ? { state: "registered", assetId: byIp.id } : { state: "new", assetId: null };
}
