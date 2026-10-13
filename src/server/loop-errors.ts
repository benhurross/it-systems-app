/** What to do about the database errors a setup mistake causes, by Postgres or Node.js error code. */
const SETUP_HINTS: Record<string, string> = {
  "42P01": "the database has no tables yet, or is missing some. Run `npm run db:migrate`.",
  "3D000": "the database named in DATABASE_URL doesn't exist. Check DATABASE_URL in .env.local.",
  "28P01": "the database refused the user name or password in DATABASE_URL. Check DATABASE_URL in .env.local.",
  ECONNREFUSED: "can't reach the database. Start it with `npm run db:up`, and check DATABASE_URL in .env.local.",
};

function errorCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    const { code, cause, errors } = current as { code?: unknown; cause?: unknown; errors?: unknown[] };
    if (typeof code === "string") return code;
    current = cause ?? errors?.[0];
  }
}

/**
 * Logs a background loop's failures without repeating them every tick: a failure is logged when it
 * first happens or changes, and recovery is logged once. A failure a setup mistake causes gets one
 * line saying what to do; anything else is logged in full, with its stack.
 */
export function failureLog(label: string) {
  let last: string | undefined;
  return {
    failed(error: unknown) {
      const code = errorCode(error);
      const hint = code ? SETUP_HINTS[code] : undefined;
      const message = hint ?? (error instanceof Error ? error.message : String(error));
      if (message === last) return;
      last = message;
      if (hint) console.error(`${label} failed: ${hint}`);
      else console.error(`${label} failed:`, error);
    },
    succeeded() {
      if (last === undefined) return;
      last = undefined;
      console.log(`${label} are working again.`);
    },
  };
}
