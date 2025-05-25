import { describe, it, expect, vi, beforeEach } from "vitest";
import { FlagCache, MemoryStorage } from "../src/cache.js";
import { NimbusClient } from "../src/client.js";

const booleanFlag = {
  key: "dark_mode",
  name: "Dark mode",
  type: "boolean" as const,
  defaultValue: true,
  environments: ["development" as const],
  version: 1,
  enabled: true,
  prerequisiteKeys: [] as string[],
};

const percentageFlag = {
  key: "new_checkout",
  name: "New checkout",
  type: "percentage" as const,
  defaultValue: true,
  environments: ["development" as const],
  version: 1,
  enabled: true,
  prerequisiteKeys: [] as string[],
  rolloutPercentage: 100,
};

describe("NimbusClient", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("bootstraps flags from api", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "etag-1" },
      json: async () => ({ flags: [booleanFlag, percentageFlag] }),
    });
    const client = new NimbusClient({
      baseUrl: "https://nimbus.test",
      environment: "development",
      userId: "user_a",
      cache: new FlagCache({ storage }),
      fetchFn,
      trackExposures: false,
    });
    await client.waitUntilReady();
    const result = client.evaluate<boolean>("dark_mode");
    expect(result.enabled).toBe(true);
    expect(result.value).toBe(true);
    client.destroy();
  });

  it("uses cache when network fails after warm cache", async () => {
    const cache = new FlagCache({ storage });
    cache.write({
      flags: [booleanFlag],
      etag: "cached",
      environment: "development",
    });
    const fetchFn = vi.fn().mockRejectedValue(new Error("offline"));
    const client = new NimbusClient({
      baseUrl: "https://nimbus.test",
      environment: "development",
      cache,
      fetchFn,
      trackExposures: false,
    });
    await client.waitUntilReady();
    expect(client.isEnabled("dark_mode")).toBe(true);
    client.destroy();
  });

  it("identify updates evaluation context", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ flags: [percentageFlag] }),
    });
    const client = new NimbusClient({
      baseUrl: "https://nimbus.test",
      environment: "development",
      fetchFn,
      trackExposures: false,
    });
    await client.waitUntilReady();
    client.identify("user_sticky");
    const first = client.evaluate("new_checkout");
    const second = client.evaluate("new_checkout");
    expect(first.enabled).toBe(second.enabled);
    expect(first.variantKey).toBe(second.variantKey);
    client.destroy();
  });

  it("respects prerequisite flags", async () => {
    const parent = { ...booleanFlag, key: "parent", defaultValue: false };
    const child = {
      ...booleanFlag,
      key: "child",
      type: "boolean" as const,
      prerequisiteKeys: ["parent"],
      defaultValue: true,
    };
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ flags: [parent, child] }),
    });
    const client = new NimbusClient({
      baseUrl: "https://nimbus.test",
      environment: "development",
      cache: new FlagCache({ storage }),
      fetchFn,
      trackExposures: false,
    });
    await client.waitUntilReady();
    const result = client.evaluate("child");
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("prerequisite");
    client.destroy();
  });
});
