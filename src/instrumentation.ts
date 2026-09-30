/** Starts the network check scheduler when a Node.js server starts, but not while building. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startScheduler } = await import("./server/monitor/scheduler");
    startScheduler();
    // Sign-in is refused from any address not listed here, so say which ones are, at every start.
    const [{ auth }, { parseOrigins }] = await Promise.all([import("./server/auth"), import("./lib/origins")]);
    const { trustedOrigins } = await auth.$context;
    console.log(`Sign-in accepted from: ${parseOrigins(trustedOrigins.join(",")).join(", ")}`);
  }
}
