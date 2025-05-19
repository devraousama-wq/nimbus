import type { UserContext } from "@nimbus/shared";

export enum RuleOperator {
  Equals = "equals",
  NotEquals = "not_equals",
  In = "in",
  NotIn = "not_in",
  Contains = "contains",
  StartsWith = "starts_with",
  EndsWith = "ends_with",
  GreaterThan = "greater_than",
  LessThan = "less_than",
  MatchesRegex = "matches_regex",
  SemverGte = "semver_gte",
  SemverLt = "semver_lt",
}

export type RuleConditionValue = string | number | boolean | string[];

export type RuleCondition = {
  attribute: string;
  operator: RuleOperator;
  value: RuleConditionValue;
};

export type RuleGroupLogic = "and" | "or" | "not";

export type RuleGroup = {
  logic: RuleGroupLogic;
  conditions?: RuleCondition[];
  groups?: RuleGroup[];
};

export type TargetingRule = {
  id: string;
  name?: string;
  priority: number;
  enabled: boolean;
  group: RuleGroup;
  variantKey?: string;
  serve?: boolean | string | number;
};

export type EvaluationContext = UserContext;

export type TargetingRuleInput = Omit<TargetingRule, "id" | "priority" | "enabled"> & {
  id?: string;
  priority?: number;
  enabled?: boolean;
};
