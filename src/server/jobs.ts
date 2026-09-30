import { deliverPending } from "./mail/outbox";

const TICK_MS = 60_000;
const server = globalThis as typeof globalThis & { jobsStarted?: boolean };

/** Housekeeping that runs every minute, once per server process: sending the email that is waiting. */
export function startJobs() {
  if (server.jobsStarted) return;
  server.jobsStarted = true;
  const tick = async () => {
    try {
      await deliverPending();
    } catch (error) {
      // Keep going through a database outage; the next tick tries again.
      console.error("Background jobs failed:", error);
    }
    setTimeout(tick, TICK_MS).unref();
  };
  setTimeout(tick, TICK_MS).unref();
}
