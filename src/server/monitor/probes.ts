import { execFile } from "node:child_process";
import { reverse } from "node:dns/promises";
import { Socket } from "node:net";
import { platform } from "node:os";
import { parseArp } from "@/lib/discovery";
import { parsePing, type ProbeResult } from "@/lib/monitor";

/** Up when a TCP connection opens before the timeout; latency is the time to connect. */
export function tcpProbe(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = new Socket();
    const finish = (up: boolean) => {
      socket.destroy();
      resolve({ up, latencyMs: up ? Math.max(1, Math.round(performance.now() - started)) : null });
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * One ICMP echo through the system `ping`, which needs no privileges. Arguments are passed as a
 * list, never through a shell, and hosts come from validated IPv4 fields.
 */
export function pingProbe(host: string, timeoutMs: number): Promise<ProbeResult> {
  const args =
    platform() === "win32"
      ? ["-n", "1", "-w", String(timeoutMs), host]
      : ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), host];
  return new Promise((resolve) => {
    execFile("ping", args, { timeout: timeoutMs + 2000, windowsHide: true }, (_error, stdout) =>
      resolve(parsePing(String(stdout))),
    );
  });
}

export async function reverseDns(ip: string): Promise<string | null> {
  try {
    return (await reverse(ip))[0] ?? null;
  } catch {
    return null;
  }
}

/** The operating system's ARP cache, which a sweep has just filled for the local subnet. */
export function arpTable(): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    execFile("arp", ["-a"], { timeout: 5000, windowsHide: true }, (_error, stdout) => resolve(parseArp(String(stdout))));
  });
}

/** Runs `task` over `items` with at most `limit` in flight. */
export async function pool<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
