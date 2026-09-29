import { afterAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_MONITOR_SETTINGS } from "@/lib/monitor";

const settings = { ...DEFAULT_MONITOR_SETTINGS, enabled: false };
vi.mock("@/server/settings", () => ({ getSetting: vi.fn(async () => ({ ...settings })) }));
vi.mock("@/server/services/monitoring", () => ({ runChecks: vi.fn(async () => {}), pruneHistory: vi.fn(async () => {}) }));

const { startScheduler } = await import("@/server/monitor/scheduler");
const { pruneHistory, runChecks } = await import("@/server/services/monitoring");

afterAll(() => {
  vi.useRealTimers();
});

describe("scheduler", () => {
  it("follows the monitoring settings without a restart", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    startScheduler();
    startScheduler();

    // Paused: nothing is checked, but old history is pruned at start.
    await vi.advanceTimersByTimeAsync(5000);
    expect(runChecks).not.toHaveBeenCalled();
    expect(pruneHistory).toHaveBeenCalledWith(30);

    // Turned on: the next tick runs a round, then one per interval.
    settings.enabled = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(runChecks).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(runChecks).toHaveBeenCalledTimes(1);

    // A failed round is logged and the loop carries on.
    vi.mocked(runChecks).mockRejectedValueOnce(new Error("database unavailable"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(runChecks).toHaveBeenCalledTimes(2);
    expect(errors).toHaveBeenCalledOnce();

    settings.intervalSeconds = 15;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(runChecks).toHaveBeenCalledTimes(3);

    settings.enabled = false;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runChecks).toHaveBeenCalledTimes(3);
    expect(pruneHistory).toHaveBeenCalledOnce();
  });
});
