import type { Environment } from "@nimbus/shared";
import {
  type FlagDefinition,
  createFlagSchema,
  updateFlagSchema,
  flagDefinitionSchema,
} from "@nimbus/shared";
import { z } from "zod";

const flags = new Map<string, FlagDefinition>();

export type MutationAction = "create" | "update" | "delete";

export type FlagMutationEvent = {
  action: MutationAction;
  key: string;
  before: FlagDefinition | null;
  after: FlagDefinition | null;
  actor: string;
  requestId: string;
};

export type MutationHook = (event: FlagMutationEvent) => void;

export type MutationContext = {
  actor?: string;
  requestId?: string;
};

export class FlagStore {
  private hooks: MutationHook[] = [];

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

  onMutation(hook: MutationHook): () => void {
    this.hooks.push(hook);
    return () => {
      this.hooks = this.hooks.filter((h) => h !== hook);
    };
  }

  create(input: unknown, ctx: MutationContext = {}): FlagDefinition {
    const parsed = createFlagSchema.parse(input);
    if (flags.has(parsed.key)) {
      throw new FlagConflictError(parsed.key);
    }
    const flag: FlagDefinition = flagDefinitionSchema.parse({
      ...parsed,
      version: 1,
    });
    flags.set(flag.key, flag);
    this.emit("create", null, flag, ctx);
    return flag;
  }

  update(key: string, input: unknown, ctx: MutationContext = {}): FlagDefinition {
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
    this.emit("update", existing, next, ctx);
    return next;
  }

  delete(key: string, ctx: MutationContext = {}): void {
    const existing = flags.get(key);
    if (!existing) {
      throw new FlagNotFoundError(key);
    }
    flags.delete(key);
    this.emit("delete", existing, null, ctx);
  }

  private emit(
    action: MutationAction,
    before: FlagDefinition | null,
    after: FlagDefinition | null,
    ctx: MutationContext,
  ): void {
    const key = after?.key ?? before?.key ?? "unknown";
    const event: FlagMutationEvent = {
      action,
      key,
      before,
      after,
      actor: ctx.actor ?? "system",
      requestId: ctx.requestId ?? `req_local_${Date.now()}`,
    };
    for (const hook of this.hooks) {
      hook(event);
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
