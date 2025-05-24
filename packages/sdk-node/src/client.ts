import {
  evaluateTargetingRules,
  parseTargetingRule,
  type TargetingRule,
} from "@nimbus/rule-engine";
import {
  isInRollout,
  resolveStableId,
  scopeFlagToEnvironment,
  selectWeightedVariant,
  type FlagDefinition,
  type UserContext,
} from "@nimbus/shared";
import type {
  BootstrapFlag,
  BootstrapPayload,
  BootstrapTargetingRule,
  ExposureBatch,
  ExposureEvent,
  FlagEvaluation,
  FlagsApiResponse,
  NimbusClientOptions,
} from "./types.js";

const DEFAULT_BOOTSTRAP_TTL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

export class NimbusClient {
  private readonly options: Required<
    Pick<
      NimbusClientOptions,
      | "baseUrl"
      | "environment"
      | "stableIdAttribute"
      | "bootstrapTtlMs"
      | "exposureBatchSize"
      | "exposureFlushIntervalMs"
    >
  > & NimbusClientOptions;

  private bootstrap: BootstrapPayload | null = null;
  private readonly flagIndex = new Map<string, BootstrapFlag>();
  private readonly exposureQueue: ExposureEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(options: NimbusClientOptions) {
    this.options = {
      bootstrapTtlMs: DEFAULT_BOOTSTRAP_TTL_MS,
      exposureBatchSize: DEFAULT_BATCH_SIZE,
      exposureFlushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
      stableIdAttribute: "userId",
      fetchImpl: globalThis.fetch,
      ...options,
    };
  }

  async initialize(): Promise<BootstrapPayload> {
    return this.refreshBootstrap();
  }

  getBootstrap(): BootstrapPayload | null {
    return this.bootstrap;
  }

  loadBootstrap(payload: BootstrapPayload): void {
    this.bootstrap = { ...payload, fetchedAt: Date.now() };
    this.flagIndex.clear();
    for (const flag of payload.flags) {
      this.flagIndex.set(flag.key, flag);
    }
  }

  isBootstrapFresh(): boolean {
    if (!this.bootstrap) {
      return false;
    }
    const age = Date.now() - this.bootstrap.fetchedAt;
    return age < this.options.bootstrapTtlMs;
  }

  async refreshBootstrap(): Promise<BootstrapPayload> {
    const fetchFn = this.options.fetchImpl ?? fetch;
    const url = new URL("/flags", this.options.baseUrl);
    url.searchParams.set("environment", this.options.environment);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }
    const response = await fetchFn(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(`bootstrap_failed:${response.status}`);
    }
    const body = (await response.json()) as FlagsApiResponse;
    const flags = body.flags
      .map((flag) => scopeFlagToEnvironment(flag, this.options.environment))
      .filter((flag): flag is FlagDefinition => flag !== null)
      .map((flag) => mapDefinitionToBootstrap(flag));
    const version = flags.reduce((max, flag) => Math.max(max, flag.version), 0);
    const payload: BootstrapPayload = {
      environment: this.options.environment,
      version,
      flags,
      fetchedAt: Date.now(),
    };
    this.bootstrap = payload;
    this.flagIndex.clear();
    for (const flag of flags) {
      this.flagIndex.set(flag.key, flag);
    }
    return payload;
  }

  async ensureBootstrap(): Promise<BootstrapPayload> {
    if (this.isBootstrapFresh() && this.bootstrap) {
      return this.bootstrap;
    }
    if (this.bootstrap) {
      try {
        return await this.refreshBootstrap();
      } catch {
        return this.bootstrap;
      }
    }
    return this.refreshBootstrap();
  }

  evaluateFlag<T = boolean | string | number | Record<string, unknown>>(
    flagKey: string,
    context: UserContext,
    stableId?: string,
  ): FlagEvaluation<T> {
    const flag = this.flagIndex.get(flagKey);
    if (!flag) {
      throw new Error(`unknown_flag:${flagKey}`);
    }
    const resolvedStableId = stableId ?? resolveStableId(context, this.options.stableIdAttribute);
    return evaluateBootstrapFlag<T>(flag, context, resolvedStableId, (key) =>
      this.evaluateFlag(key, context, resolvedStableId),
    );
  }

  trackExposure(
    flagKey: string,
    context: UserContext,
    evaluation?: FlagEvaluation,
    stableId?: string,
  ): void {
    const resolved =
      evaluation ??
      this.evaluateFlag(flagKey, context, stableId);
    const event: ExposureEvent = {
      flagKey,
      variantKey: resolved.variantKey,
      environment: this.options.environment,
      userId: resolveStableId(context, this.options.stableIdAttribute),
      timestamp: Date.now(),
      value: resolved.value,
      reason: resolved.reason,
    };
    this.exposureQueue.push(event);
    if (this.exposureQueue.length >= this.options.exposureBatchSize) {
      void this.flushExposures();
    } else {
      this.ensureFlushTimer();
    }
  }

  async flushExposures(): Promise<void> {
    if (this.flushing || this.exposureQueue.length === 0) {
      return;
    }
    this.flushing = true;
    const batch: ExposureBatch = {
      events: this.exposureQueue.splice(0, this.options.exposureBatchSize),
    };
    try {
      const fetchFn = this.options.fetchImpl ?? fetch;
      const url = new URL("/exposures", this.options.baseUrl);
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (this.options.apiKey) {
        headers.Authorization = `Bearer ${this.options.apiKey}`;
      }
      await fetchFn(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });
    } finally {
      this.flushing = false;
      if (this.exposureQueue.length > 0) {
        void this.flushExposures();
      }
    }
  }

  startExposureFlushing(): void {
    this.ensureFlushTimer();
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private ensureFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setInterval(() => {
      void this.flushExposures();
    }, this.options.exposureFlushIntervalMs);
    if (typeof this.flushTimer.unref === "function") {
      this.flushTimer.unref();
    }
  }
}

function mapDefinitionToBootstrap(flag: FlagDefinition): BootstrapFlag {
  return {
    key: flag.key,
    type: flag.type,
    enabled: flag.enabled,
    defaultValue: flag.defaultValue,
    rolloutPercentage: flag.rolloutPercentage,
    salt: flag.key,
    prerequisiteKeys: flag.prerequisiteKeys,
    variants: flag.variants,
    targetingRules: [],
    defaultVariantKey: null,
    version: flag.version,
  };
}

function normalizeTargetingRules(rules: BootstrapTargetingRule[] | undefined): TargetingRule[] {
  if (!rules || rules.length === 0) {
    return [];
  }
  return rules.map((rule, index) =>
    parseTargetingRule({
      ...rule,
      id: rule.id ?? `rule_${index}`,
      priority: rule.priority ?? 0,
      enabled: rule.enabled ?? true,
    }),
  );
}

function evaluateBootstrapFlag<T>(
  flag: BootstrapFlag,
  context: UserContext,
  stableId: string,
  evaluatePrerequisite: (key: string) => FlagEvaluation,
): FlagEvaluation<T> {
  if (!flag.enabled) {
    return buildEvaluation(flag, flag.defaultValue as T, "disabled", false, null, false);
  }

  for (const prerequisiteKey of flag.prerequisiteKeys ?? []) {
    const prerequisite = evaluatePrerequisite(prerequisiteKey);
    if (!prerequisite.matched || prerequisite.value === false) {
      return buildEvaluation(flag, flag.defaultValue as T, "prerequisite", false, null, false);
    }
  }

  const rules = normalizeTargetingRules(flag.targetingRules);
  const targetingMatch = evaluateTargetingRules(rules, context);
  if (targetingMatch) {
    const variantKey = targetingMatch.variantKey ?? flag.defaultVariantKey ?? null;
    const value = resolveVariantValue(flag, variantKey, targetingMatch.serve);
    return buildEvaluation(flag, value as T, "targeting", true, targetingMatch.id, true);
  }

  if (flag.type === "percentage" || flag.rolloutPercentage !== undefined) {
    const percentage = flag.rolloutPercentage ?? 0;
    const inRollout = isInRollout(flag.key, stableId, flag.salt ?? flag.key, percentage);
    if (!inRollout) {
      return buildEvaluation(flag, flag.defaultValue as T, "rollout", false, null, false);
    }
    if (flag.variants && flag.variants.length > 0) {
      const variantKey = selectWeightedVariant(
        stableId,
        flag.key,
        flag.variants,
        flag.salt ?? flag.key,
      );
      const value = resolveVariantValue(flag, variantKey, undefined);
      return buildEvaluation(flag, value as T, "variant", true, null, true);
    }
    return buildEvaluation(flag, flag.defaultValue as T, "rollout", true, null, true);
  }

  if (flag.type === "multivariate" && flag.variants && flag.variants.length > 0) {
    const variantKey = selectWeightedVariant(
      stableId,
      flag.key,
      flag.variants,
      flag.salt ?? flag.key,
    );
    const value = resolveVariantValue(flag, variantKey, undefined);
    return buildEvaluation(flag, value as T, "variant", true, null, true);
  }

  return buildEvaluation(flag, flag.defaultValue as T, "default", false, null, true);
}

function resolveVariantValue(
  flag: BootstrapFlag,
  variantKey: string | null,
  serve: boolean | string | number | undefined,
): boolean | string | number | Record<string, unknown> {
  if (serve !== undefined) {
    return serve;
  }
  if (!variantKey || !flag.variants) {
    return flag.defaultValue;
  }
  const variant = flag.variants.find((item) => item.key === variantKey);
  return variant?.value ?? flag.defaultValue;
}

function buildEvaluation<T>(
  flag: BootstrapFlag,
  value: T,
  reason: FlagEvaluation["reason"],
  matched: boolean,
  ruleId: string | null,
  inRollout: boolean,
): FlagEvaluation<T> {
  const variantKey =
    flag.variants?.find((variant) => variant.value === value)?.key ??
    flag.defaultVariantKey ??
    null;
  return {
    flagKey: flag.key,
    value,
    variantKey,
    reason,
    matched,
    ruleId,
    inRollout,
  };
}
