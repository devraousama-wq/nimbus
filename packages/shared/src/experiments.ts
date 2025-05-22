import { z } from "zod";
import { flagKeySchema } from "./flags.js";

export const experimentStatusSchema = z.enum([
  "draft",
  "running",
  "paused",
  "completed",
  "archived",
]);

export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const experimentVariantSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1).max(256),
  weight: z.number().min(0).max(100),
  description: z.string().max(2000).optional(),
  isControl: z.boolean().default(false),
});

export type ExperimentVariant = z.infer<typeof experimentVariantSchema>;

export const experimentGoalSchema = z.object({
  key: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  eventName: z.string().min(1).max(256),
  metricType: z.enum(["conversion", "count", "revenue"]).default("conversion"),
});

export type ExperimentGoal = z.infer<typeof experimentGoalSchema>;

export const experimentKeySchema = flagKeySchema;

export const experimentDefinitionSchema = z.object({
  key: experimentKeySchema,
  name: z.string().min(1).max(256),
  description: z.string().max(4000).optional(),
  status: experimentStatusSchema.default("draft"),
  flagKey: flagKeySchema,
  salt: z.string().min(1).max(256).default("default"),
  variants: z.array(experimentVariantSchema).min(2),
  goals: z.array(experimentGoalSchema).default([]),
  trafficAllocation: z.number().min(0).max(100).default(100),
  version: z.number().int().positive().default(1),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
});

export type ExperimentDefinition = z.infer<typeof experimentDefinitionSchema>;

export const createExperimentSchema = experimentDefinitionSchema.omit({
  version: true,
  startedAt: true,
  endedAt: true,
});

export const updateExperimentSchema = experimentDefinitionSchema
  .partial()
  .required({ key: true });

export function normalizeVariantWeights(
  variants: ExperimentVariant[],
): ExperimentVariant[] {
  const total = variants.reduce((sum, v) => sum + v.weight, 0);
  if (total === 0) {
    const even = 100 / variants.length;
    return variants.map((v) => ({ ...v, weight: even }));
  }
  if (total === 100) {
    return variants;
  }
  const scale = 100 / total;
  return variants.map((v) => ({ ...v, weight: v.weight * scale }));
}

export function findControlVariant(
  variants: readonly ExperimentVariant[],
): ExperimentVariant | undefined {
  return variants.find((v) => v.isControl) ?? variants[0];
}

export function findVariantByKey(
  variants: readonly ExperimentVariant[],
  key: string,
): ExperimentVariant | undefined {
  return variants.find((v) => v.key === key);
}

export function validateExperimentVariants(variants: ExperimentVariant[]): void {
  if (variants.length < 2) {
    throw new Error("experiment requires at least two variants");
  }
  const keys = new Set<string>();
  for (const variant of variants) {
    if (keys.has(variant.key)) {
      throw new Error(`duplicate variant key: ${variant.key}`);
    }
    keys.add(variant.key);
  }
  const controls = variants.filter((v) => v.isControl);
  if (controls.length > 1) {
    throw new Error("experiment may have at most one control variant");
  }
}

export function canTransitionStatus(
  from: ExperimentStatus,
  to: ExperimentStatus,
): boolean {
  if (from === to) {
    return true;
  }
  const allowed: Record<ExperimentStatus, ExperimentStatus[]> = {
    draft: ["running", "archived"],
    running: ["paused", "completed", "archived"],
    paused: ["running", "completed", "archived"],
    completed: ["archived"],
    archived: [],
  };
  return allowed[from].includes(to);
}

export type ExperimentExposure = {
  experimentKey: string;
  variantKey: string;
  userId: string;
  timestamp: string;
};

export type ExperimentAssignment = {
  experimentKey: string;
  variantKey: string;
  inExperiment: boolean;
  bucket: number;
};
