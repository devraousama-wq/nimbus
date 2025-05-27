import type { Environment, UserContext } from "@nimbus/shared";
import {
  type SegmentDefinition,
  type SegmentPreviewRequest,
  type SegmentPreviewResult,
  type SegmentUsageEntry,
  createSegmentSchema,
  updateSegmentSchema,
  segmentDefinitionSchema,
  collectAllSegmentRefs,
  validateSegmentReferences,
  scopeSegmentToEnvironment,
} from "@nimbus/shared";
import {
  parseRuleGroup,
  evaluateRuleGroup,
  type RuleGroup,
  type SegmentResolver,
} from "@nimbus/rule-engine";
import { z } from "zod";

const segments = new Map<string, SegmentDefinition>();

function segmentGroupToRuleGroup(group: SegmentDefinition["group"]): RuleGroup {
  return parseRuleGroup(group);
}

export class SegmentStore {
  list(environment?: Environment): SegmentDefinition[] {
    const all = [...segments.values()];
    if (!environment) {
      return all;
    }
    return all
      .map((s) => scopeSegmentToEnvironment(s, environment))
      .filter((s): s is SegmentDefinition => s !== null);
  }

  get(key: string): SegmentDefinition | undefined {
    return segments.get(key);
  }

  create(input: unknown): SegmentDefinition {
    const parsed = createSegmentSchema.parse(input);
    if (segments.has(parsed.key)) {
      throw new SegmentConflictError(parsed.key);
    }
    const segment: SegmentDefinition = segmentDefinitionSchema.parse({
      ...parsed,
      version: 1,
    });
    const validation = validateSegmentReferences(segment, (k) => segments.get(k));
    if (!validation.valid) {
      throw new SegmentReferenceError(validation.errors.join("; "));
    }
    segments.set(segment.key, segment);
    return segment;
  }

  update(key: string, input: unknown): SegmentDefinition {
    const existing = segments.get(key);
    if (!existing) {
      throw new SegmentNotFoundError(key);
    }
    const patch = updateSegmentSchema.parse(
      Object.assign({}, input as Record<string, unknown>, { key }),
    );
    const next: SegmentDefinition = segmentDefinitionSchema.parse({
      ...existing,
      ...patch,
      key,
      version: existing.version + 1,
    });
    const validation = validateSegmentReferences(next, (k) => segments.get(k));
    if (!validation.valid) {
      throw new SegmentReferenceError(validation.errors.join("; "));
    }
    segments.set(key, next);
    return next;
  }

  delete(key: string): void {
    if (!segments.delete(key)) {
      throw new SegmentNotFoundError(key);
    }
  }

  usageReport(): SegmentUsageEntry[] {
    const entries = new Map<string, SegmentUsageEntry>();
    for (const segment of segments.values()) {
      entries.set(segment.key, {
        segmentKey: segment.key,
        referencedBy: [],
        references: collectAllSegmentRefs(segment),
      });
    }
    for (const segment of segments.values()) {
      for (const ref of collectAllSegmentRefs(segment)) {
        const entry = entries.get(ref);
        if (entry) {
          entry.referencedBy.push(segment.key);
        }
      }
    }
    return [...entries.values()].sort((a, b) => a.segmentKey.localeCompare(b.segmentKey));
  }

  preview(key: string, request: SegmentPreviewRequest): SegmentPreviewResult {
    const segment = segments.get(key);
    if (!segment) {
      throw new SegmentNotFoundError(key);
    }
    const resolver = this.createSegmentResolver();
    const group = segmentGroupToRuleGroup(segment.group);
    const results = request.contexts.map((ctx, index) => ({
      index,
      matched: evaluateRuleGroup(group, ctx as UserContext, { segmentResolver: resolver }),
    }));
    const matchCount = results.filter((r) => r.matched).length;
    return { key, results, matchCount };
  }

  matches(key: string, context: UserContext, environment?: Environment): boolean {
    const segment = segments.get(key);
    if (!segment || !segment.enabled) {
      return false;
    }
    if (environment && !segment.environments.includes(environment)) {
      return false;
    }
    const resolver = this.createSegmentResolver();
    const group = segmentGroupToRuleGroup(segment.group);
    return evaluateRuleGroup(group, context, { segmentResolver: resolver });
  }

  createSegmentResolver(): SegmentResolver {
    return (segmentKey, context, visiting) => {
      if (visiting.has(segmentKey)) {
        return false;
      }
      const segment = segments.get(segmentKey);
      if (!segment || !segment.enabled) {
        return false;
      }
      visiting.add(segmentKey);
      const group = segmentGroupToRuleGroup(segment.group);
      const matched = evaluateRuleGroup(
        group,
        context,
        { segmentResolver: this.createSegmentResolver() },
        visiting,
      );
      visiting.delete(segmentKey);
      return matched;
    };
  }
}

export class SegmentNotFoundError extends Error {
  constructor(key: string) {
    super(`segment not found: ${key}`);
    this.name = "SegmentNotFoundError";
  }
}

export class SegmentConflictError extends Error {
  constructor(key: string) {
    super(`segment already exists: ${key}`);
    this.name = "SegmentConflictError";
  }
}

export class SegmentReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SegmentReferenceError";
  }
}

export const environmentParamSchema = z.object({
  environment: z.enum(["development", "staging", "production"]).optional(),
});

export const segmentPreviewBodySchema = z.object({
  contexts: z
    .array(z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])))
    .min(1)
    .max(100),
});
