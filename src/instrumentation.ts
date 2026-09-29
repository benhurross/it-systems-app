/** Starts the network check scheduler when a Node.js server starts, but not while building. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startScheduler } = await import("./server/monitor/scheduler");
    startScheduler();
  }
}
