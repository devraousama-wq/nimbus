import type { Environment, FlagDefinition, UserContext } from "@nimbus/shared";
import { scopeFlagToEnvironment } from "@nimbus/shared";
import { FlagCache, type BootstrapPayload } from "./cache.js";
import { ExposureTracker } from "./exposures.js";

export type NimbusClientOptions = {
  baseUrl: string;
  environment: Environment;
  userId?: string;
  context?: UserContext;
  cache?: FlagCache;
  exposureTracker?: ExposureTracker;
  fetchFn?: typeof fetch;
  trackExposures?: boolean;
};

export type FlagValue<T = boolean | string | number | Record<string, unknown>> = {
  key: string;
  value: T;
  enabled: boolean;
  variantKey: string | null;
  reason: "default" | "disabled" | "rollout" | "variant" | "prerequisite";
};

type BootstrapResponse = {
  flags: FlagDefinition[];
  etag?: string;
};

export class NimbusClient {
  private readonly baseUrl: string;
  private readonly environment: Environment;
  private readonly cache: FlagCache;
  private readonly exposures: ExposureTracker | null;
  private readonly fetchFn: typeof fetch;
  private readonly trackExposures: boolean;
  private flags = new Map<string, FlagDefinition>();
  private userId: string | null;
  private context: UserContext;
  private etag: string | null = null;
  private ready: Promise<void>;

  constructor(options: NimbusClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.environment = options.environment;
    this.cache = options.cache ?? new FlagCache();
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.trackExposures = options.trackExposures ?? true;
    this.userId = options.userId ?? null;
    this.context = { ...options.context };
    if (this.userId) {
      this.context.userId = this.userId;
    }
    this.exposures =
      options.exposureTracker ??
      (this.trackExposures
        ? new ExposureTracker({ endpoint: `${this.baseUrl}/exposures` })
        : null);
    this.exposures?.configure(this.environment, this.userId);
    this.exposures?.start();
    this.ready = this.hydrate();
  }

  async waitUntilReady(): Promise<void> {
    await this.ready;
  }

  identify(userId: string, context: UserContext = {}): void {
    this.userId = userId;
    this.context = { ...context, userId };
    this.exposures?.configure(this.environment, this.userId);
  }

  getContext(): UserContext {
    return { ...this.context };
  }

  async refresh(force = false): Promise<void> {
    if (!force && this.cache.isFresh(this.etag)) {
      const cached = this.cache.read();
      if (cached) {
        this.applyBootstrap(cached);
        return;
      }
    }
    const headers: Record<string, string> = {};
    if (this.etag) {
      headers["if-none-match"] = this.etag;
    }
    const url = `${this.baseUrl}/flags?environment=${this.environment}`;
    const res = await this.fetchFn(url, { headers });
    if (res.status === 304) {
      const cached = this.cache.read();
      if (cached) {
        this.applyBootstrap(cached);
      }
      return;
    }
    if (!res.ok) {
      throw new NimbusFetchError(url, res.status);
    }
    const body = (await res.json()) as BootstrapResponse;
    const etag = res.headers.get("etag") ?? body.etag ?? `gen_${Date.now()}`;
    const payload = this.cache.write({
      flags: body.flags,
      etag,
      environment: this.environment,
    });
    this.applyBootstrap(payload);
  }

  evaluate<T = boolean | string | number | Record<string, unknown>>(
    key: string,
    defaultValue?: T,
  ): FlagValue<T> {
    const flag = this.flags.get(key);
    if (!flag) {
      return {
        key,
        value: defaultValue as T,
        enabled: false,
        variantKey: null,
        reason: "default",
      };
    }
    const scoped = scopeFlagToEnvironment(flag, this.environment);
    if (!scoped || !scoped.enabled) {
      return {
        key,
        value: (scoped?.defaultValue ?? defaultValue) as T,
        enabled: false,
        variantKey: null,
        reason: scoped ? "disabled" : "default",
      };
    }
    const result = resolveFlagValue(scoped, this.context, this.flags);
    if (this.trackExposures && this.exposures) {
      this.exposures.track({
        flagKey: key,
        variantKey: result.variantKey,
        value: result.value as boolean | string | number | Record<string, unknown>,
      });
    }
    return result as FlagValue<T>;
  }

  isEnabled(key: string): boolean {
    return this.evaluate(key).enabled;
  }

  getFlagDefinition(key: string): FlagDefinition | undefined {
    return this.flags.get(key);
  }

  listFlags(): FlagDefinition[] {
    return [...this.flags.values()];
  }

  destroy(): void {
    this.exposures?.stop();
  }

  private async hydrate(): Promise<void> {
    const cached = this.cache.read();
    if (cached && cached.environment === this.environment) {
      this.applyBootstrap(cached);
    }
    try {
      await this.refresh(false);
    } catch {
      if (!cached) {
        throw new NimbusBootstrapError(this.baseUrl);
      }
    }
  }

  private applyBootstrap(payload: BootstrapPayload): void {
    this.etag = payload.etag;
    this.flags.clear();
    for (const flag of payload.flags) {
      const scoped = scopeFlagToEnvironment(flag, this.environment);
      if (scoped) {
        this.flags.set(flag.key, scoped);
      }
    }
  }
}

export class NimbusFetchError extends Error {
  constructor(url: string, status: number) {
    super(`nimbus fetch failed: ${status} ${url}`);
    this.name = "NimbusFetchError";
  }
}

export class NimbusBootstrapError extends Error {
  constructor(baseUrl: string) {
    super(`nimbus bootstrap failed: ${baseUrl}`);
    this.name = "NimbusBootstrapError";
  }
}

function resolveFlagValue(
  flag: FlagDefinition,
  context: UserContext,
  allFlags: Map<string, FlagDefinition>,
): FlagValue {
  if (flag.prerequisiteKeys.length > 0) {
    for (const prereq of flag.prerequisiteKeys) {
      const dep = allFlags.get(prereq);
      if (!dep || !resolveFlagValue(dep, context, allFlags).enabled) {
        return {
          key: flag.key,
          value: flag.defaultValue,
          enabled: false,
          variantKey: null,
          reason: "prerequisite",
        };
      }
    }
  }

  if (flag.type === "boolean") {
    const value = Boolean(flag.defaultValue);
    return { key: flag.key, value, enabled: value, variantKey: null, reason: "default" };
  }

  if (flag.type === "percentage") {
    const pct = flag.rolloutPercentage ?? 0;
    const bucket = stickyBucket(flag.key, context);
    const inRollout = bucket < pct;
    return {
      key: flag.key,
      value: inRollout ? flag.defaultValue : false,
      enabled: inRollout,
      variantKey: inRollout ? "on" : "off",
      reason: "rollout",
    };
  }

  if (flag.type === "multivariate" && flag.variants && flag.variants.length > 0) {
    const bucket = stickyBucket(flag.key, context);
    const variant = pickVariant(flag.variants, bucket);
    return {
      key: flag.key,
      value: variant.value,
      enabled: true,
      variantKey: variant.key,
      reason: "variant",
    };
  }

  return {
    key: flag.key,
    value: flag.defaultValue,
    enabled: true,
    variantKey: null,
    reason: "default",
  };
}

function stickyBucket(flagKey: string, context: UserContext): number {
  const seed = String(context.userId ?? context.deviceId ?? "anonymous");
  return murmurHash32(`${flagKey}:${seed}`) % 100;
}

function pickVariant(
  variants: NonNullable<FlagDefinition["variants"]>,
  bucket: number,
): NonNullable<FlagDefinition["variants"]>[number] {
  const weights = variants.map((v) => v.weight ?? Math.floor(100 / variants.length));
  let cursor = 0;
  for (let i = 0; i < variants.length; i++) {
    const w = weights[i] ?? 0;
    cursor += w;
    if (bucket < cursor) {
      return variants[i]!;
    }
  }
  return variants[variants.length - 1]!;
}

function murmurHash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}
