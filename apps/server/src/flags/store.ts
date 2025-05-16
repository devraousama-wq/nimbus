import type { Environment } from "@nimbus/shared";
import {
  type FlagDefinition,
  createFlagSchema,
  updateFlagSchema,
  flagDefinitionSchema,
} from "@nimbus/shared";
import { z } from "zod";

const flags = new Map<string, FlagDefinition>();

export class FlagStore {
  list(environment?: Environment): FlagDefinition[] {
    const all = [...flags.values()];
    if (!environment) {
      return all;
    }
    return all.filter((f) => f.environments.includes(environment));
  }

  get(key: string): FlagDefinition | undefined {
    return flags.get(key);
  }

  create(input: unknown): FlagDefinition {
    const parsed = createFlagSchema.parse(input);
    if (flags.has(parsed.key)) {
      throw new FlagConflictError(parsed.key);
    }
    const flag: FlagDefinition = flagDefinitionSchema.parse({
      ...parsed,
      version: 1,
    });
    flags.set(flag.key, flag);
    return flag;
  }

  update(key: string, input: unknown): FlagDefinition {
    const existing = flags.get(key);
    if (!existing) {
      throw new FlagNotFoundError(key);
    }
    const patch = updateFlagSchema.parse({ ...input, key });
    const next: FlagDefinition = flagDefinitionSchema.parse({
      ...existing,
      ...patch,
      key,
      version: existing.version + 1,
    });
    flags.set(key, next);
    return next;
  }

  delete(key: string): void {
    if (!flags.delete(key)) {
      throw new FlagNotFoundError(key);
    }
  }
}

export class FlagNotFoundError extends Error {
  constructor(key: string) {
    super(`flag not found: ${key}`);
    this.name = "FlagNotFoundError";
  }
}

export class FlagConflictError extends Error {
  constructor(key: string) {
    super(`flag already exists: ${key}`);
    this.name = "FlagConflictError";
  }
}

export const environmentParamSchema = z.object({
  environment: z.enum(["development", "staging", "production"]).optional(),
});
