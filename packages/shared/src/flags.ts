import { z } from "zod";
import type { Environment } from "./index.js";

export const flagTypeSchema = z.enum([
  "boolean",
  "multivariate",
  "percentage",
  "prerequisite",
]);

export type FlagType = z.infer<typeof flagTypeSchema>;

export const environmentSchema = z.enum(["development", "staging", "production"]);

export const flagKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const flagDefinitionSchema = z.object({
  key: flagKeySchema,
  name: z.string().min(1).max(256),
  type: flagTypeSchema,
  description: z.string().max(2000).optional(),
  defaultValue: z.union([z.boolean(), z.string(), z.number(), z.record(z.unknown())]),
  environments: z.array(environmentSchema).min(1),
  version: z.number().int().positive().default(1),
  enabled: z.boolean().default(true),
  prerequisiteKeys: z.array(flagKeySchema).default([]),
  variants: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.union([z.string(), z.number(), z.record(z.unknown())]),
        weight: z.number().min(0).max(100).optional(),
      }),
    )
    .optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
});

export type FlagDefinition = z.infer<typeof flagDefinitionSchema>;

export const createFlagSchema = flagDefinitionSchema.omit({ version: true });

export const updateFlagSchema = flagDefinitionSchema.partial().required({ key: true });

export function scopeFlagToEnvironment(
  flag: FlagDefinition,
  env: Environment,
): FlagDefinition | null {
  if (!flag.environments.includes(env)) {
    return null;
  }
  return flag;
}
