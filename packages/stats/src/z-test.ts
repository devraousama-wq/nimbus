import type {
  ProportionComparisonInput,
  ProportionSample,
  ZTestResult,
} from "./types.js";

function assertValidSample(sample: ProportionSample, label: string): void {
  if (!Number.isFinite(sample.successes) || !Number.isFinite(sample.trials)) {
    throw new RangeError(`${label} sample values must be finite numbers`);
  }
  if (sample.trials < 0 || sample.successes < 0) {
    throw new RangeError(`${label} sample counts must be non-negative`);
  }
  if (sample.successes > sample.trials) {
    throw new RangeError(`${label} successes cannot exceed trials`);
  }
}

function rate(sample: ProportionSample): number {
  if (sample.trials === 0) {
    return 0;
  }
  return sample.successes / sample.trials;
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax));
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function normalSurvival(z: number): number {
  return 1 - normalCdf(z);
}

function computePValue(
  zScore: number,
  alternative: "two-sided" | "greater" | "less",
): number {
  if (alternative === "greater") {
    return normalSurvival(zScore);
  }
  if (alternative === "less") {
    return normalCdf(zScore);
  }
  const abs = Math.abs(zScore);
  return 2 * normalSurvival(abs);
}

export function proportionZTest(input: ProportionComparisonInput): ZTestResult {
  const alpha = input.alpha ?? 0.05;
  const alternative = input.alternative ?? "two-sided";
  assertValidSample(input.control, "control");
  assertValidSample(input.treatment, "treatment");
  if (alpha <= 0 || alpha >= 1) {
    throw new RangeError("alpha must be between 0 and 1 exclusive");
  }

  const controlRate = rate(input.control);
  const treatmentRate = rate(input.treatment);
  const absoluteLift = treatmentRate - controlRate;
  const relativeLift =
    controlRate === 0 ? (treatmentRate === 0 ? 0 : Infinity) : absoluteLift / controlRate;

  const n1 = input.control.trials;
  const n2 = input.treatment.trials;
  if (n1 === 0 || n2 === 0) {
    return {
      zScore: 0,
      pValue: 1,
      significant: false,
      alpha,
      alternative,
      controlRate,
      treatmentRate,
      absoluteLift,
      relativeLift,
      pooledRate: 0,
      standardError: 0,
    };
  }

  const pooledSuccesses = input.control.successes + input.treatment.successes;
  const pooledTrials = n1 + n2;
  const pooledRate = pooledSuccesses / pooledTrials;
  const standardError = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / n1 + 1 / n2),
  );

  if (standardError === 0) {
    return {
      zScore: 0,
      pValue: 1,
      significant: false,
      alpha,
      alternative,
      controlRate,
      treatmentRate,
      absoluteLift,
      relativeLift,
      pooledRate,
      standardError: 0,
    };
  }

  const zScore = absoluteLift / standardError;
  const pValue = computePValue(zScore, alternative);
  const significant = pValue < alpha;

  return {
    zScore,
    pValue,
    significant,
    alpha,
    alternative,
    controlRate,
    treatmentRate,
    absoluteLift,
    relativeLift,
    pooledRate,
    standardError,
  };
}

export function pooledProportion(samples: ProportionSample[]): number {
  let successes = 0;
  let trials = 0;
  for (const sample of samples) {
    assertValidSample(sample, "pooled");
    successes += sample.successes;
    trials += sample.trials;
  }
  if (trials === 0) {
    return 0;
  }
  return successes / trials;
}

export function zCriticalValue(alpha: number, alternative: "two-sided" | "greater" | "less"): number {
  if (alternative === "two-sided") {
    if (alpha === 0.1) return 1.6448536269;
    if (alpha === 0.05) return 1.9599639845;
    if (alpha === 0.01) return 2.5758293035;
    return 1.9599639845;
  }
  if (alpha === 0.1) return 1.2815515655;
  if (alpha === 0.05) return 1.6448536269;
  if (alpha === 0.01) return 2.326347874;
  return 1.6448536269;
}
