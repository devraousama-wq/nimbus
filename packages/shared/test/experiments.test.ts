import { describe, it, expect } from "vitest";
import {
  createExperimentSchema,
  experimentDefinitionSchema,
  normalizeVariantWeights,
  findControlVariant,
  findVariantByKey,
  validateExperimentVariants,
  canTransitionStatus,
} from "../src/experiments.js";

const baseExperiment = {
  key: "checkout_cta",
  name: "Checkout CTA color",
  flagKey: "checkout_button",
  variants: [
    { key: "control", name: "Blue", weight: 50, isControl: true },
    { key: "green", name: "Green", weight: 50, isControl: false },
  ],
};

describe("experiment schemas", () => {
  it("parses create payload", () => {
    const parsed = createExperimentSchema.parse(baseExperiment);
    expect(parsed.key).toBe("checkout_cta");
    expect(parsed.variants).toHaveLength(2);
  });

  it("rejects invalid keys and single variant", () => {
    expect(() =>
      createExperimentSchema.parse({
        ...baseExperiment,
        key: "Bad",
      }),
    ).toThrow();
    expect(() =>
      createExperimentSchema.parse({
        ...baseExperiment,
        variants: [{ key: "only", name: "Only", weight: 100 }],
      }),
    ).toThrow();
  });
});

describe("variant helpers", () => {
  it("normalizes weights to 100", () => {
    const normalized = normalizeVariantWeights([
      { key: "a", name: "A", weight: 25, isControl: true },
      { key: "b", name: "B", weight: 25, isControl: false },
    ]);
    const total = normalized.reduce((s, v) => s + v.weight, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it("finds control and variant by key", () => {
    const variants = baseExperiment.variants;
    expect(findControlVariant(variants)?.key).toBe("control");
    expect(findVariantByKey(variants, "green")?.name).toBe("Green");
    expect(findVariantByKey(variants, "missing")).toBeUndefined();
  });

  it("validates duplicate and multiple controls", () => {
    expect(() =>
      validateExperimentVariants([
        { key: "a", name: "A", weight: 50, isControl: true },
        { key: "a", name: "B", weight: 50, isControl: false },
      ]),
    ).toThrow();
    expect(() =>
      validateExperimentVariants([
        { key: "a", name: "A", weight: 50, isControl: true },
        { key: "b", name: "B", weight: 50, isControl: true },
      ]),
    ).toThrow();
  });
});

describe("status transitions", () => {
  it("allows valid transitions", () => {
    expect(canTransitionStatus("draft", "running")).toBe(true);
    expect(canTransitionStatus("running", "paused")).toBe(true);
    expect(canTransitionStatus("paused", "running")).toBe(true);
    expect(canTransitionStatus("running", "completed")).toBe(true);
  });

  it("blocks invalid transitions", () => {
    expect(canTransitionStatus("draft", "completed")).toBe(false);
    expect(canTransitionStatus("archived", "running")).toBe(false);
  });
});

describe("experiment definition", () => {
  it("parses full definition with version", () => {
    const full = experimentDefinitionSchema.parse({
      ...baseExperiment,
      version: 1,
      status: "draft",
      trafficAllocation: 100,
      goals: [{ key: "purchase", name: "Purchase", eventName: "purchase" }],
    });
    expect(full.goals).toHaveLength(1);
  });
});
