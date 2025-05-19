import type { UserContext } from "@nimbus/shared";
import {
  parseTargetingRule,
  evaluateTargetingRules,
  type TargetingRule,
} from "@nimbus/rule-engine";

export type FlagTargetingInput = {
  rules?: unknown[];
  defaultVariantKey?: string | null;
};

export type FlagEvaluationResult = {
  matched: boolean;
  ruleId: string | null;
  variantKey: string | null;
  serve: boolean | string | number | null;
};

function normalizeRules(rules: unknown[] | undefined): TargetingRule[] {
  if (!rules || rules.length === 0) {
    return [];
  }
  return rules.map((rule) => parseTargetingRule(rule));
}

export function evaluateFlagTargeting(
  input: FlagTargetingInput,
  context: UserContext,
): FlagEvaluationResult {
  const rules = normalizeRules(input.rules);
  const match = evaluateTargetingRules(rules, context);

  if (match) {
    return {
      matched: true,
      ruleId: match.id,
      variantKey: match.variantKey ?? input.defaultVariantKey ?? null,
      serve: match.serve ?? null,
    };
  }

  return {
    matched: false,
    ruleId: null,
    variantKey: input.defaultVariantKey ?? null,
    serve: null,
  };
}

export function evaluateFlagForContext(
  flagKey: string,
  targeting: FlagTargetingInput,
  context: UserContext,
): FlagEvaluationResult & { flagKey: string } {
  const result = evaluateFlagTargeting(targeting, context);
  return { flagKey, ...result };
}
