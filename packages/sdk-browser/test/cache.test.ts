import { describe, it, expect, beforeEach } from "vitest";
import { FlagCache, MemoryStorage } from "../src/cache.js";

const sampleFlag = {
  key: "dark_mode",
  name: "Dark mode",
  type: "boolean" as const,
  defaultValue: false,
  environments: ["development" as const],
  version: 1,
  enabled: true,
  prerequisiteKeys: [] as string[],
};

describe("FlagCache", () => {
  let storage: MemoryStorage;
  let cache: FlagCache;

  beforeEach(() => {
    storage = new MemoryStorage();
    cache = new FlagCache({ storage, ttlMs: 60_000, storageKey: "test" });
  });

  it("writes and reads bootstrap payload", () => {
    const written = cache.write({
      flags: [sampleFlag],
      etag: "v1",
      environment: "development",
    });
    expect(written.flags).toHaveLength(1);
    const read = cache.read();
    expect(read?.etag).toBe("v1");
    expect(read?.flags[0]?.key).toBe("dark_mode");
  });

  it("expires stale entries", () => {
    cache.write({
      flags: [sampleFlag],
      etag: "v1",
      environment: "development",
      fetchedAt: Date.now() - 120_000,
    });
    expect(cache.read()).toBeNull();
  });

  it("tracks etag freshness", () => {
    cache.write({ flags: [sampleFlag], etag: "v2", environment: "development" });
    expect(cache.isFresh("v2")).toBe(true);
    expect(cache.isFresh("v3")).toBe(false);
  });

  it("clears storage", () => {
    cache.write({ flags: [sampleFlag], etag: "v1", environment: "development" });
    cache.clear();
    expect(cache.read()).toBeNull();
  });
});
