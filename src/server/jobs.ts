import { deliverPending, pruneOutbox } from "./mail/outbox";
import { autoCloseResolved } from "./services/respond";
import { failureLog } from "./loop-errors";

const TICK_MS = 60_000;
const DAY_MS = 86_400_000;
const server = globalThis as typeof globalThis & { jobsStarted?: boolean };

/**
 * Housekeeping, once per server process: every minute, closing unanswered resolved tickets and
 * sending the email that is waiting; once a day, clearing old email from the outbox.
 */
export function startJobs() {
  if (server.jobsStarted) return;
  server.jobsStarted = true;
  let lastPrune = 0;
  const log = failureLog("Background jobs");
  const tick = async () => {
    try {
      await autoCloseResolved();
      await deliverPending();
      if (Date.now() - lastPrune >= DAY_MS) {
        lastPrune = Date.now();
        await pruneOutbox();
      }
      log.succeeded();
    } catch (error) {
      // Keep going through a database outage; the next tick tries again.
      log.failed(error);
    }
    setTimeout(tick, TICK_MS).unref();
  };
  setTimeout(tick, TICK_MS).unref();
}
