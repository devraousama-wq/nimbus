import { evaluateCondition } from "./evaluators.js";
import type {
  EvaluationContext,
  RuleGroup,
  SegmentResolver,
  TargetingRule,
} from "./types.js";

export type EvaluateOptions = {
  segmentResolver?: SegmentResolver;
};

function hasChildren(group: RuleGroup): boolean {
  return (
    (group.conditions?.length ?? 0) > 0
    || (group.groups?.length ?? 0) > 0
    || (group.segmentRefs?.length ?? 0) > 0
  );
}

function evaluateSegmentRefs(
  refs: string[] | undefined,
  context: EvaluationContext,
  options: EvaluateOptions,
  visiting: Set<string>,
): boolean {
  if (!refs || refs.length === 0) {
    return true;
  }
  const resolver = options.segmentResolver;
  if (!resolver) {
    return false;
  }
  for (const ref of refs) {
    if (!resolver(ref, context, visiting)) {
      return false;
    }
  }
  return true;
}

function evaluateAnd(
  group: RuleGroup,
  context: EvaluationContext,
  options: EvaluateOptions,
  visiting: Set<string>,
): boolean {
  for (const condition of group.conditions ?? []) {
    if (!evaluateCondition(condition, context)) {
      return false;
    }
  }
  if (!evaluateSegmentRefs(group.segmentRefs, context, options, visiting)) {
    return false;
  }
  for (const child of group.groups ?? []) {
    if (!evaluateRuleGroup(child, context, options, visiting)) {
      return false;
    }
  }
  return hasChildren(group);
}

function evaluateOr(
  group: RuleGroup,
  context: EvaluationContext,
  options: EvaluateOptions,
  visiting: Set<string>,
): boolean {
  for (const condition of group.conditions ?? []) {
    if (evaluateCondition(condition, context)) {
      return true;
    }
  }
  for (const ref of group.segmentRefs ?? []) {
    const resolver = options.segmentResolver;
    if (resolver?.(ref, context, visiting)) {
      return true;
    }
  }
  for (const child of group.groups ?? []) {
    if (evaluateRuleGroup(child, context, options, visiting)) {
      return true;
    }
  }
  return false;
}

function evaluateNot(
  group: RuleGroup,
  context: EvaluationContext,
  options: EvaluateOptions,
  visiting: Set<string>,
): boolean {
  if (!hasChildren(group)) {
    return false;
  }
  if (
    (group.groups?.length ?? 0) === 1
    && (group.conditions?.length ?? 0) === 0
    && (group.segmentRefs?.length ?? 0) === 0
  ) {
    const child = group.groups![0]!;
    return !evaluateRuleGroup(child, context, options, visiting);
  }
  return !evaluateAnd(
    {
      logic: "and",
      conditions: group.conditions,
      groups: group.groups,
      segmentRefs: group.segmentRefs,
    },
    context,
    options,
    visiting,
  );
}

export function evaluateRuleGroup(
  group: RuleGroup,
  context: EvaluationContext,
  options: EvaluateOptions = {},
  visiting: Set<string> = new Set(),
): boolean {
  switch (group.logic) {
    case "and":
      return evaluateAnd(group, context, options, visiting);
    case "or":
      return evaluateOr(group, context, options, visiting);
    case "not":
      return evaluateNot(group, context, options, visiting);
    default:
      return false;
  }
}

export function evaluateTargetingRule(
  rule: TargetingRule,
  context: EvaluationContext,
  options: EvaluateOptions = {},
): boolean {
  if (!rule.enabled) {
    return false;
  }
  return evaluateRuleGroup(rule.group, context, options);
}

export function evaluateTargetingRules(
  rules: TargetingRule[],
  context: EvaluationContext,
  options: EvaluateOptions = {},
): TargetingRule | null {
  const ordered = [...rules].sort((a, b) => b.priority - a.priority);
  for (const rule of ordered) {
    if (evaluateTargetingRule(rule, context, options)) {
      return rule;
    }
  }
  return null;
}
