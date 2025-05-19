import { z } from "zod";
import {
  RuleOperator,
  type RuleGroup,
  type RuleCondition,
  type TargetingRule,
} from "./types.js";

const ruleConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

const ruleConditionSchema: z.ZodType<RuleCondition> = z.object({
  attribute: z.string().min(1),
  operator: z.nativeEnum(RuleOperator),
  value: ruleConditionValueSchema,
});

const ruleGroupSchema: z.ZodType<RuleGroup> = z.lazy(() =>
  z
    .object({
      logic: z.enum(["and", "or", "not"]),
      conditions: z.array(ruleConditionSchema).optional(),
      groups: z.array(ruleGroupSchema).optional(),
    })
    .superRefine((group, ctx) => {
      const hasConditions = (group.conditions?.length ?? 0) > 0;
      const hasGroups = (group.groups?.length ?? 0) > 0;
      if (!hasConditions && !hasGroups) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "rule group must have at least one condition or nested group",
        });
      }
      if (group.logic === "not" && (group.groups?.length ?? 0) > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "not groups may contain at most one nested group",
        });
      }
    }),
);

const targetingRuleSchema: z.ZodType<TargetingRule> = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  priority: z.number().int(),
  enabled: z.boolean(),
  group: ruleGroupSchema,
  variantKey: z.string().min(1).optional(),
  serve: z.union([z.boolean(), z.string(), z.number()]).optional(),
});

function createRuleId(): string {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const targetingRuleInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  group: ruleGroupSchema,
  variantKey: z.string().min(1).optional(),
  serve: z.union([z.boolean(), z.string(), z.number()]).optional(),
}).transform((input): TargetingRule => ({
  id: input.id ?? createRuleId(),
  name: input.name,
  priority: input.priority ?? 0,
  enabled: input.enabled ?? true,
  group: input.group,
  variantKey: input.variantKey,
  serve: input.serve,
}));

export function parseRuleGroup(input: unknown): RuleGroup {
  return ruleGroupSchema.parse(input);
}

export function parseRule(input: unknown): RuleGroup {
  return parseRuleGroup(input);
}

export function parseTargetingRule(input: unknown): TargetingRule {
  return targetingRuleInputSchema.parse(input);
}

export function safeParseRuleGroup(
  input: unknown,
): z.SafeParseReturnType<unknown, RuleGroup> {
  return ruleGroupSchema.safeParse(input);
}

export function safeParseTargetingRule(
  input: unknown,
): z.SafeParseReturnType<unknown, TargetingRule> {
  return targetingRuleInputSchema.safeParse(input);
}

export {
  ruleConditionSchema,
  ruleGroupSchema,
  targetingRuleSchema,
  targetingRuleInputSchema,
};
