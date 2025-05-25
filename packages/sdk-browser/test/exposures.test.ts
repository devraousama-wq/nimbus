import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExposureTracker } from "../src/exposures.js";

describe("ExposureTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("batches and flushes exposure events", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const tracker = new ExposureTracker({
      endpoint: "https://nimbus.test/exposures",
      batchSize: 2,
      flushIntervalMs: 30_000,
      fetchFn,
    });
    tracker.configure("staging", "user_1");
    tracker.track({ flagKey: "a", variantKey: null, value: true });
    tracker.track({ flagKey: "b", variantKey: "v1", value: "blue" });
    await tracker.flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(body.exposures).toHaveLength(2);
    expect(body.exposures[0].userId).toBe("user_1");
    tracker.stop();
  });

  it("flushes on interval", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const tracker = new ExposureTracker({
      endpoint: "https://nimbus.test/exposures",
      batchSize: 10,
      flushIntervalMs: 5_000,
      fetchFn,
    });
    tracker.start();
    tracker.track({ flagKey: "x", variantKey: null, value: false });
    vi.advanceTimersByTime(5_000);
    await Promise.resolve();
    expect(fetchFn).toHaveBeenCalled();
    tracker.stop();
  });
});
