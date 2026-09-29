import type { DeviceStatus } from "./domain";

export type MonitorSettings = {
  enabled: boolean;
  intervalSeconds: number;
  timeoutMs: number;
  /** Latency above this marks a device degraded. */
  degradedMs: number;
  retentionDays: number;
};

export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  enabled: true,
  intervalSeconds: 60,
  timeoutMs: 2000,
  degradedMs: 300,
  retentionDays: 30,
};

/** Failed checks in a row before a device is called down, so one dropped packet is not an outage. */
export const FAILURES_TO_DOWN = 2;

export type ProbeResult = { up: boolean; latencyMs: number | null };

export type Transition = {
  status: DeviceStatus;
  failures: number;
  /** An alert to open, if the device has just become down or degraded. */
  open: "down" | "degraded" | null;
  /** Whether open alerts should be resolved: the device has recovered or changed kind of trouble. */
  resolve: boolean;
};

export function nextState(
  previous: { status: DeviceStatus; failures: number },
  result: ProbeResult,
  degradedMs: number,
): Transition {
  const failures = result.up ? 0 : previous.failures + 1;
  let status: DeviceStatus;
  if (result.up) status = (result.latencyMs ?? 0) > degradedMs ? "degraded" : "up";
  else status = failures >= FAILURES_TO_DOWN ? "down" : previous.status;

  const changed = status !== previous.status;
  return {
    status,
    failures,
    open: changed && (status === "down" || status === "degraded") ? status : null,
    resolve: changed && (previous.status === "down" || previous.status === "degraded"),
  };
}

/** Share of checks that were up; null when there are none. */
export function availability(checks: { up: boolean }[]): number | null {
  if (checks.length === 0) return null;
  return checks.filter((c) => c.up).length / checks.length;
}

/**
 * Parses one `ping` run. Success needs a reply carrying a TTL: Windows ping exits 0 on
 * "Destination host unreachable", which is a reply from a router, not from the device.
 */
export function parsePing(output: string): ProbeResult {
  if (!/ttl=/i.test(output)) return { up: false, latencyMs: null };
  const time = output.match(/time[=<]\s*([\d.]+)\s*ms/i);
  return { up: true, latencyMs: time ? Math.max(1, Math.round(Number(time[1]))) : 1 };
}
