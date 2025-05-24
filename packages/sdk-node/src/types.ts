import type { Environment, FlagDefinition, FlagType, UserContext } from "@nimbus/shared";

export type NimbusClientOptions = {
  baseUrl: string;
  environment: Environment;
  apiKey?: string;
  stableIdAttribute?: string;
  bootstrapTtlMs?: number;
  exposureBatchSize?: number;
  exposureFlushIntervalMs?: number;
  fetchImpl?: typeof fetch;
};

export type BootstrapTargetingRule = {
  id?: string;
  name?: string;
  priority?: number;
  enabled?: boolean;
  group: unknown;
  variantKey?: string;
  serve?: boolean | string | number;
};

export type BootstrapFlag = {
  key: string;
  type: FlagType;
  enabled: boolean;
  defaultValue: boolean | string | number | Record<string, unknown>;
  rolloutPercentage?: number;
  salt?: string;
  prerequisiteKeys?: string[];
  variants?: Array<{
    key: string;
    value: string | number | Record<string, unknown>;
    weight?: number;
  }>;
  targetingRules?: BootstrapTargetingRule[];
  defaultVariantKey?: string | null;
  version: number;
};

export type BootstrapPayload = {
  environment: Environment;
  version: number;
  flags: BootstrapFlag[];
  fetchedAt: number;
};

export type EvaluationReason =
  | "disabled"
  | "prerequisite"
  | "targeting"
  | "rollout"
  | "default"
  | "variant";

export type FlagEvaluation<T = boolean | string | number | Record<string, unknown>> = {
  flagKey: string;
  value: T;
  variantKey: string | null;
  reason: EvaluationReason;
  matched: boolean;
  ruleId: string | null;
  inRollout: boolean;
};

export type ExposureEvent = {
  flagKey: string;
  variantKey: string | null;
  environment: Environment;
  userId?: string;
  timestamp: number;
  value: boolean | string | number | Record<string, unknown> | null;
  reason: EvaluationReason;
};

export type ExposureBatch = {
  events: ExposureEvent[];
};

export type FlagsApiResponse = {
  flags: FlagDefinition[];
};
