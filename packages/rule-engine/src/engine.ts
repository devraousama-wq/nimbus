import { evaluateCondition } from "./evaluators.js";
import type { EvaluationContext, RuleGroup, TargetingRule } from "./types.js";

function hasChildren(group: RuleGroup): boolean {
  return (group.conditions?.length ?? 0) > 0 || (group.groups?.length ?? 0) > 0;
}

function evaluateAnd(group: RuleGroup, context: EvaluationContext): boolean {
  for (const condition of group.conditions ?? []) {
    if (!evaluateCondition(condition, context)) {
      return false;
    }
  }
  for (const child of group.groups ?? []) {
    if (!evaluateRuleGroup(child, context)) {
      return false;
    }
  }
  return hasChildren(group);
}

function evaluateOr(group: RuleGroup, context: EvaluationContext): boolean {
  for (const condition of group.conditions ?? []) {
    if (evaluateCondition(condition, context)) {
      return true;
    }
  }
  for (const child of group.groups ?? []) {
    if (evaluateRuleGroup(child, context)) {
      return true;
    }
  }
  return false;
}

function evaluateNot(group: RuleGroup, context: EvaluationContext): boolean {
  if (!hasChildren(group)) {
    return false;
  }
  if ((group.groups?.length ?? 0) === 1 && (group.conditions?.length ?? 0) === 0) {
    const child = group.groups![0]!;
    return !evaluateRuleGroup(child, context);
  }
  return !evaluateAnd(
    { logic: "and", conditions: group.conditions, groups: group.groups },
    context,
  );
}

export function evaluateRuleGroup(group: RuleGroup, context: EvaluationContext): boolean {
  switch (group.logic) {
    case "and":
      return evaluateAnd(group, context);
    case "or":
      return evaluateOr(group, context);
    case "not":
      return evaluateNot(group, context);
    default:
      return false;
  }
}

export function evaluateTargetingRule(
  rule: TargetingRule,
  context: EvaluationContext,
): boolean {
  if (!rule.enabled) {
    return false;
  }
  return evaluateRuleGroup(rule.group, context);
}

export function evaluateTargetingRules(
  rules: TargetingRule[],
  context: EvaluationContext,
): TargetingRule | null {
  const ordered = [...rules].sort((a, b) => b.priority - a.priority);
  for (const rule of ordered) {
    if (evaluateTargetingRule(rule, context)) {
      return rule;
    }
  }
  return null;
}
