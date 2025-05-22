export type ProportionSample = {
  successes: number;
  trials: number;
};

export type ProportionComparisonInput = {
  control: ProportionSample;
  treatment: ProportionSample;
  alpha?: number;
  alternative?: "two-sided" | "greater" | "less";
};

export type ZTestResult = {
  zScore: number;
  pValue: number;
  significant: boolean;
  alpha: number;
  alternative: "two-sided" | "greater" | "less";
  controlRate: number;
  treatmentRate: number;
  absoluteLift: number;
  relativeLift: number;
  pooledRate: number;
  standardError: number;
};

export type ConfidenceInterval = {
  lower: number;
  upper: number;
  level: number;
};

export type ProportionIntervalInput = {
  sample: ProportionSample;
  level?: number;
};

export type SampleSizeInput = {
  baselineRate: number;
  minimumDetectableEffect: number;
  alpha?: number;
  power?: number;
};

export type SampleSizeResult = {
  perVariant: number;
  total: number;
  baselineRate: number;
  minimumDetectableEffect: number;
  alpha: number;
  power: number;
};

export type BayesianVariantStats = {
  variantKey: string;
  successes: number;
  trials: number;
  alphaPrior: number;
  betaPrior: number;
  posteriorAlpha: number;
  posteriorBeta: number;
  mean: number;
};

export type VariantProbabilityResult = {
  probabilities: Record<string, number>;
  winner: string | null;
};
