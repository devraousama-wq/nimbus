import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NimbusClient } from "../src/client.js";
import type { BootstrapFlag, FlagsApiResponse } from "../src/types.js";

const baseFlags: FlagsApiResponse = {
  flags: [
    {
      key: "new_checkout",
      name: "New checkout",
      type: "boolean",
      defaultValue: false,
      environments: ["development"],
      version: 2,
      enabled: true,
      prerequisiteKeys: [],
      rolloutPercentage: 50,
    },
    {
      key: "hero_color",
      name: "Hero color",
      type: "multivariate",
      defaultValue: "blue",
      environments: ["development"],
      version: 1,
      enabled: true,
      prerequisiteKeys: [],
      variants: [
        { key: "blue", value: "blue", weight: 50 },
        { key: "green", value: "green", weight: 50 },
      ],
    },
  ],
};

function mockFetch(body: FlagsApiResponse, exposureStatus = 204) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/flags")) {
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as Response;
    }
    if (url.includes("/exposures") && init?.method === "POST") {
      return { ok: exposureStatus >= 200 && exposureStatus < 300, status: exposureStatus } as Response;
    }
    return { ok: false, status: 404 } as Response;
  });
}

describe("NimbusClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads bootstrap and evaluates deterministically", async () => {
    const fetchImpl = mockFetch(baseFlags);
    const client = new NimbusClient({
      baseUrl: "http://localhost:4100",
      environment: "development",
      fetchImpl,
    });
    await client.initialize();
    const context = { userId: "user_alpha" };
    const first = client.evaluateFlag<boolean>("new_checkout", context);
    const second = client.evaluateFlag<boolean>("new_checkout", context);
    expect(first.value).toBe(second.value);
    expect(first.flagKey).toBe("new_checkout");
  });

  it("assigns multivariate variants with stable bucketing", async () => {
    const fetchImpl = mockFetch(baseFlags);
    const client = new NimbusClient({
      baseUrl: "http://localhost:4100",
      environment: "development",
      fetchImpl,
    });
    await client.initialize();
    const evaluation = client.evaluateFlag<string>("hero_color", { userId: "user_beta" });
    expect(["blue", "green"]).toContain(evaluation.value);
    expect(evaluation.variantKey).toBeTruthy();
  });

  it("batches exposure events", async () => {
    const fetchImpl = mockFetch(baseFlags);
    const client = new NimbusClient({
      baseUrl: "http://localhost:4100",
      environment: "development",
      exposureBatchSize: 2,
      fetchImpl,
    });
    await client.initialize();
    client.trackExposure("new_checkout", { userId: "u1" });
    client.trackExposure("hero_color", { userId: "u2" });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    const exposureCall = fetchImpl.mock.calls.find((call) =>
      String(call[0]).includes("/exposures"),
    );
    expect(exposureCall).toBeDefined();
    const body = JSON.parse(String(exposureCall?.[1]?.body));
    expect(body.events).toHaveLength(2);
    client.shutdown();
  });

  it("falls back to cached bootstrap when refresh fails", async () => {
    let failRefresh = false;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/flags")) {
        if (failRefresh) {
          return { ok: false, status: 503 } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => baseFlags,
        } as Response;
      }
      return { ok: true, status: 204 } as Response;
    });
    const client = new NimbusClient({
      baseUrl: "http://localhost:4100",
      environment: "development",
      bootstrapTtlMs: 1,
      fetchImpl,
    });
    await client.initialize();
    failRefresh = true;
    vi.advanceTimersByTime(5);
    const payload = await client.ensureBootstrap();
    expect(payload.flags).toHaveLength(2);
  });

  it("respects disabled flags", async () => {
    const fetchImpl = mockFetch({
      flags: [
        {
          ...baseFlags.flags[0]!,
          enabled: false,
        },
      ],
    });
    const client = new NimbusClient({
      baseUrl: "http://localhost:4100",
      environment: "development",
      fetchImpl,
    });
    await client.initialize();
    const result = client.evaluateFlag("new_checkout", { userId: "u3" });
    expect(result.reason).toBe("disabled");
    expect(result.value).toBe(false);
  });
});

describe("targeting rules", () => {
  it("applies targeting rules from bootstrap payload", () => {
    const flagWithRules: BootstrapFlag = {
      key: "beta_feature",
      type: "boolean",
      enabled: true,
      defaultValue: false,
      version: 1,
      targetingRules: [
        {
          id: "pro_users",
          priority: 10,
          enabled: true,
          group: {
            logic: "and",
            conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
          },
          serve: true,
        },
      ],
    };
    const client = new NimbusClient({
      baseUrl: "http://localhost:4100",
      environment: "development",
    });
    client.loadBootstrap({
      environment: "development",
      version: 1,
      flags: [flagWithRules],
      fetchedAt: Date.now(),
    });
    const match = client.evaluateFlag<boolean>("beta_feature", { userId: "x", plan: "pro" });
    expect(match.matched).toBe(true);
    expect(match.value).toBe(true);
    expect(match.reason).toBe("targeting");
  });
});
