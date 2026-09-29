import { pruneHistory, runChecks } from "../services/monitoring";
import { getSetting } from "../settings";

const TICK_MS = 5000;
const DAY_MS = 86_400_000;

const server = globalThis as typeof globalThis & { monitorScheduler?: boolean };

/**
 * Starts the check loop, once per server process. Settings are read on every tick, so turning
 * checks on or off, or changing the interval, takes effect within seconds and without a restart.
 * A round finishes before the next tick is scheduled, so rounds never overlap.
 */
export function startScheduler() {
  if (server.monitorScheduler) return;
  server.monitorScheduler = true;
  let lastRound = 0;
  let lastPrune = 0;

  const tick = async () => {
    try {
      const settings = await getSetting("monitoring");
      const now = Date.now();
      if (settings.enabled && now - lastRound >= settings.intervalSeconds * 1000) {
        lastRound = now;
        await runChecks(settings);
      }
      if (now - lastPrune >= DAY_MS) {
        lastPrune = now;
        await pruneHistory(settings.retentionDays);
      }
    } catch (error) {
      // Keep the loop alive through a database outage; the next tick tries again.
      console.error("Network checks failed:", error);
    }
    setTimeout(tick, TICK_MS).unref();
  };
  setTimeout(tick, TICK_MS).unref();
}
