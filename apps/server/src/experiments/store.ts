import type { ExperimentStatus } from "@nimbus/shared";
import {
  type ExperimentDefinition,
  createExperimentSchema,
  updateExperimentSchema,
  experimentDefinitionSchema,
  canTransitionStatus,
  validateExperimentVariants,
} from "@nimbus/shared";

const experiments = new Map<string, ExperimentDefinition>();

export class ExperimentStore {
  list(status?: ExperimentStatus): ExperimentDefinition[] {
    const all = [...experiments.values()];
    if (!status) {
      return all;
    }
    return all.filter((e) => e.status === status);
  }

  get(key: string): ExperimentDefinition | undefined {
    return experiments.get(key);
  }

  create(input: unknown): ExperimentDefinition {
    const parsed = createExperimentSchema.parse(input);
    if (experiments.has(parsed.key)) {
      throw new ExperimentConflictError(parsed.key);
    }
    validateExperimentVariants(parsed.variants);
    const experiment: ExperimentDefinition = experimentDefinitionSchema.parse({
      ...parsed,
      version: 1,
    });
    experiments.set(experiment.key, experiment);
    return experiment;
  }

  update(key: string, input: unknown): ExperimentDefinition {
    const existing = experiments.get(key);
    if (!existing) {
      throw new ExperimentNotFoundError(key);
    }
    const patch = updateExperimentSchema.parse({ ...input, key });
    if (patch.variants) {
      validateExperimentVariants(patch.variants);
    }
    if (patch.status && patch.status !== existing.status) {
      if (!canTransitionStatus(existing.status, patch.status)) {
        throw new ExperimentStatusError(existing.status, patch.status);
      }
    }
    const next: ExperimentDefinition = experimentDefinitionSchema.parse({
      ...existing,
      ...patch,
      key,
      version: existing.version + 1,
    });
    experiments.set(key, next);
    return next;
  }

  delete(key: string): void {
    if (!experiments.delete(key)) {
      throw new ExperimentNotFoundError(key);
    }
  }

  setStatus(key: string, status: ExperimentStatus): ExperimentDefinition {
    return this.update(key, { status });
  }
}

export class ExperimentNotFoundError extends Error {
  constructor(key: string) {
    super(`experiment not found: ${key}`);
    this.name = "ExperimentNotFoundError";
  }
}

export class ExperimentConflictError extends Error {
  constructor(key: string) {
    super(`experiment already exists: ${key}`);
    this.name = "ExperimentConflictError";
  }
}

export class ExperimentStatusError extends Error {
  constructor(from: ExperimentStatus, to: ExperimentStatus) {
    super(`invalid experiment status transition: ${from} -> ${to}`);
    this.name = "ExperimentStatusError";
  }
}
