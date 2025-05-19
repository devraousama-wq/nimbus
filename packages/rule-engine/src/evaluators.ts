import { RuleOperator, type RuleCondition, type EvaluationContext } from "./types.js";

type SemverParts = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
};

function getAttributeValue(
  context: EvaluationContext,
  attribute: string,
): string | number | boolean | string[] | undefined {
  return context[attribute];
}

function parseSemver(value: string): SemverParts | null {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

function compareSemver(left: string, right: string): number | null {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) {
    return null;
  }
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  if (a.patch !== b.patch) {
    return a.patch - b.patch;
  }
  if (a.prerelease === null && b.prerelease === null) {
    return 0;
  }
  if (a.prerelease === null) {
    return 1;
  }
  if (b.prerelease === null) {
    return -1;
  }
  if (a.prerelease === b.prerelease) {
    return 0;
  }
  return a.prerelease < b.prerelease ? -1 : 1;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function valuesEqual(
  actual: string | number | boolean | string[] | undefined,
  expected: string | number | boolean | string[],
): boolean {
  if (actual === undefined) {
    return false;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      return false;
    }
    return actual.every((item, index) => item === expected[index]);
  }
  return actual === expected;
}

function evaluateIn(
  actual: string | number | boolean | string[] | undefined,
  expected: RuleCondition["value"],
): boolean {
  if (actual === undefined) {
    return false;
  }
  if (!Array.isArray(expected)) {
    return false;
  }
  if (Array.isArray(actual)) {
    return actual.some((item) => expected.includes(item));
  }
  return expected.includes(String(actual));
}

function evaluateContains(
  actual: string | number | boolean | string[] | undefined,
  expected: RuleCondition["value"],
): boolean {
  if (actual === undefined) {
    return false;
  }
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }
  if (Array.isArray(actual)) {
    if (typeof expected === "string") {
      return actual.includes(expected);
    }
    if (Array.isArray(expected)) {
      return expected.every((item) => actual.includes(item));
    }
  }
  return false;
}

export function evaluateCondition(
  condition: RuleCondition,
  context: EvaluationContext,
): boolean {
  const actual = getAttributeValue(context, condition.attribute);
  const expected = condition.value;

  switch (condition.operator) {
    case RuleOperator.Equals:
      return valuesEqual(actual, expected);
    case RuleOperator.NotEquals:
      return !valuesEqual(actual, expected);
    case RuleOperator.In:
      return evaluateIn(actual, expected);
    case RuleOperator.NotIn:
      return !evaluateIn(actual, expected);
    case RuleOperator.Contains:
      return evaluateContains(actual, expected);
    case RuleOperator.StartsWith:
      return typeof actual === "string" && typeof expected === "string"
        ? actual.startsWith(expected)
        : false;
    case RuleOperator.EndsWith:
      return typeof actual === "string" && typeof expected === "string"
        ? actual.endsWith(expected)
        : false;
    case RuleOperator.GreaterThan: {
      const left = toNumber(actual);
      const right = toNumber(expected);
      return left !== null && right !== null && left > right;
    }
    case RuleOperator.LessThan: {
      const left = toNumber(actual);
      const right = toNumber(expected);
      return left !== null && right !== null && left < right;
    }
    case RuleOperator.MatchesRegex: {
      if (typeof actual !== "string" || typeof expected !== "string") {
        return false;
      }
      try {
        return new RegExp(expected).test(actual);
      } catch {
        return false;
      }
    }
    case RuleOperator.SemverGte: {
      if (typeof actual !== "string" || typeof expected !== "string") {
        return false;
      }
      const cmp = compareSemver(actual, expected);
      return cmp !== null && cmp >= 0;
    }
    case RuleOperator.SemverLt: {
      if (typeof actual !== "string" || typeof expected !== "string") {
        return false;
      }
      const cmp = compareSemver(actual, expected);
      return cmp !== null && cmp < 0;
    }
    default:
      return false;
  }
}
