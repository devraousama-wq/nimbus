import { describe, it, expect } from "vitest";
import { proportionZTest, pooledProportion, zCriticalValue } from "../src/z-test.js";

describe("proportionZTest", () => {
  it("detects significant lift", () => {
    const result = proportionZTest({
      control: { successes: 100, trials: 10_000 },
      treatment: { successes: 130, trials: 10_000 },
      alpha: 0.05,
    });
    expect(result.controlRate).toBeCloseTo(0.01, 5);
    expect(result.treatmentRate).toBeCloseTo(0.013, 5);
    expect(result.absoluteLift).toBeCloseTo(0.003, 5);
    expect(result.zScore).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.significant).toBe(true);
  });

  it("returns non-significant for similar rates", () => {
    const result = proportionZTest({
      control: { successes: 500, trials: 10_000 },
      treatment: { successes: 510, trials: 10_000 },
      alpha: 0.05,
    });
    expect(result.significant).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it("handles zero trials safely", () => {
    const result = proportionZTest({
      control: { successes: 0, trials: 0 },
      treatment: { successes: 10, trials: 100 },
    });
    expect(result.pValue).toBe(1);
    expect(result.significant).toBe(false);
  });

  it("supports one-sided alternatives", () => {
    const greater = proportionZTest({
      control: { successes: 50, trials: 1000 },
      treatment: { successes: 80, trials: 1000 },
      alternative: "greater",
      alpha: 0.05,
    });
    const less = proportionZTest({
      control: { successes: 80, trials: 1000 },
      treatment: { successes: 50, trials: 1000 },
      alternative: "less",
      alpha: 0.05,
    });
    expect(greater.significant).toBe(true);
    expect(less.significant).toBe(true);
    expect(greater.zScore).toBeGreaterThan(0);
    expect(less.zScore).toBeLessThan(0);
  });

  it("rejects invalid samples", () => {
    expect(() =>
      proportionZTest({
        control: { successes: 10, trials: 5 },
        treatment: { successes: 1, trials: 100 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      proportionZTest({
        control: { successes: 1, trials: 100 },
        treatment: { successes: 2, trials: 50 },
        alpha: 1.5,
      }),
    ).toThrow(RangeError);
  });
});

describe("pooledProportion", () => {
  it("aggregates multiple samples", () => {
    const rate = pooledProportion([
      { successes: 10, trials: 100 },
      { successes: 20, trials: 100 },
    ]);
    expect(rate).toBeCloseTo(0.15, 5);
  });
});

describe("zCriticalValue", () => {
  it("returns known critical values", () => {
    expect(zCriticalValue(0.05, "two-sided")).toBeCloseTo(1.96, 2);
    expect(zCriticalValue(0.05, "greater")).toBeCloseTo(1.645, 2);
  });
});
