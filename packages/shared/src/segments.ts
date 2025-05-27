import { z } from "zod";
import { environmentSchema } from "./flags.js";

export const segmentKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const segmentRuleOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "matches_regex",
  "semver_gte",
  "semver_lt",
]);

export const segmentConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export type SegmentConditionValue = z.infer<typeof segmentConditionValueSchema>;

export type SegmentCondition = {
  attribute: string;
  operator: z.infer<typeof segmentRuleOperatorSchema>;
  value: SegmentConditionValue;
};

export type SegmentRuleGroup = {
  logic: "and" | "or" | "not";
  conditions?: SegmentCondition[];
  groups?: SegmentRuleGroup[];
  segmentRefs?: string[];
};

const segmentConditionSchema: z.ZodType<SegmentCondition> = z.object({
  attribute: z.string().min(1),
  operator: segmentRuleOperatorSchema,
  value: segmentConditionValueSchema,
});

const segmentRuleGroupSchema: z.ZodType<SegmentRuleGroup> = z.lazy(() =>
  z
    .object({
      logic: z.enum(["and", "or", "not"]),
      conditions: z.array(segmentConditionSchema).optional(),
      groups: z.array(segmentRuleGroupSchema).optional(),
      segmentRefs: z.array(segmentKeySchema).optional(),
    })
    .superRefine((group, ctx) => {
      const hasConditions = (group.conditions?.length ?? 0) > 0;
      const hasGroups = (group.groups?.length ?? 0) > 0;
      const hasRefs = (group.segmentRefs?.length ?? 0) > 0;
      if (!hasConditions && !hasGroups && !hasRefs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "segment rule group must have conditions, nested groups, or segment refs",
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

export const segmentDefinitionSchema = z.object({
  key: segmentKeySchema,
  name: z.string().min(1).max(256),
  description: z.string().max(2000).optional(),
  environments: z.array(environmentSchema).min(1),
  group: segmentRuleGroupSchema,
  nestedSegmentKeys: z.array(segmentKeySchema).default([]),
  version: z.number().int().positive().default(1),
  enabled: z.boolean().default(true),
});

export type SegmentDefinition = z.infer<typeof segmentDefinitionSchema>;

export const createSegmentSchema = segmentDefinitionSchema.omit({ version: true });

export const updateSegmentSchema = segmentDefinitionSchema
  .partial()
  .required({ key: true });

export type SegmentUsageEntry = {
  segmentKey: string;
  referencedBy: string[];
  references: string[];
};

export type SegmentPreviewRequest = {
  contexts: Array<Record<string, string | number | boolean | string[]>>;
};

export type SegmentPreviewResult = {
  key: string;
  results: Array<{ index: number; matched: boolean }>;
  matchCount: number;
};

export function extractSegmentRefsFromGroup(group: SegmentRuleGroup): string[] {
  const refs = new Set<string>();
  for (const key of group.segmentRefs ?? []) {
    refs.add(key);
  }
  for (const nested of group.groups ?? []) {
    for (const key of extractSegmentRefsFromGroup(nested)) {
      refs.add(key);
    }
  }
  return [...refs];
}

export function collectAllSegmentRefs(segment: SegmentDefinition): string[] {
  const fromGroup = extractSegmentRefsFromGroup(segment.group);
  const combined = new Set<string>([...segment.nestedSegmentKeys, ...fromGroup]);
  return [...combined];
}

export function detectSegmentCycle(
  startKey: string,
  lookup: (key: string) => SegmentDefinition | undefined,
): string[] | null {
  const visiting = new Set<string>();
  const path: string[] = [];

  function walk(key: string): string[] | null {
    if (visiting.has(key)) {
      const cycleStart = path.indexOf(key);
      return cycleStart >= 0 ? [...path.slice(cycleStart), key] : [key, key];
    }
    const segment = lookup(key);
    if (!segment) {
      return null;
    }
    visiting.add(key);
    path.push(key);
    const refs = collectAllSegmentRefs(segment);
    for (const ref of refs) {
      const cycle = walk(ref);
      if (cycle) {
        return cycle;
      }
    }
    path.pop();
    visiting.delete(key);
    return null;
  }

  return walk(startKey);
}

export function validateSegmentReferences(
  segment: SegmentDefinition,
  lookup: (key: string) => SegmentDefinition | undefined,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const refs = collectAllSegmentRefs(segment);
  for (const ref of refs) {
    if (ref === segment.key) {
      errors.push(`segment cannot reference itself: ${ref}`);
      continue;
    }
    if (!lookup(ref)) {
      errors.push(`unknown segment reference: ${ref}`);
    }
  }
  const cycle = detectSegmentCycle(segment.key, (key) => {
    if (key === segment.key) {
      return segment;
    }
    return lookup(key);
  });
  if (cycle) {
    errors.push(`circular segment reference: ${cycle.join(" -> ")}`);
  }
  return { valid: errors.length === 0, errors };
}

export function scopeSegmentToEnvironment(
  segment: SegmentDefinition,
  env: z.infer<typeof environmentSchema>,
): SegmentDefinition | null {
  if (!segment.environments.includes(env)) {
    return null;
  }
  return segment;
}

export {
  segmentConditionSchema,
  segmentRuleGroupSchema,
};
