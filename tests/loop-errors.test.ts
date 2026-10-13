import { afterEach, describe, expect, it, vi } from "vitest";
import { failureLog } from "@/server/loop-errors";

/** An error shaped like the one Drizzle throws when Postgres refuses a query. */
function queryError(code: string) {
  return new Error("Failed query: select 1", { cause: Object.assign(new Error("refused"), { code }) });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("failureLog", () => {
  it("says what to do about a database with no tables, once until it changes", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = failureLog("Network checks");

    for (let tick = 0; tick < 5; tick++) log.failed(queryError("42P01"));
    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0]).toEqual([expect.stringMatching(/^Network checks failed: .*npm run db:migrate/)]);

    log.succeeded();
    log.succeeded();
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith("Network checks are working again.");

    // After recovering, the same failure is reported again.
    log.failed(queryError("42P01"));
    expect(errors).toHaveBeenCalledTimes(2);
  });

  it("explains a database that can't be reached", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = new AggregateError([Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })], "");
    failureLog("Background jobs").failed(refused);
    expect(errors.mock.calls[0]).toEqual([expect.stringMatching(/^Background jobs failed: can't reach the database.*db:up/)]);
  });

  it("logs any other failure in full, and again when it changes", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = failureLog("Background jobs");
    const first = new Error("mail server timed out");
    log.failed(first);
    log.failed(new Error("mail server timed out"));
    log.failed(new Error("mail server refused the password"));
    expect(errors).toHaveBeenCalledTimes(2);
    expect(errors.mock.calls[0]).toEqual(["Background jobs failed:", first]);
  });
});
