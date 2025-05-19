import { describe, it, expect } from "vitest";
import {
  RuleOperator,
  type RuleCondition,
  parseRule,
  parseRuleGroup,
  parseTargetingRule,
  safeParseRuleGroup,
  evaluateCondition,
  evaluateRuleGroup,
  evaluateTargetingRule,
  evaluateTargetingRules,
} from "../src/index.js";

const ctx = {
  userId: "user_42",
  country: "US",
  plan: "pro",
  beta: true,
  loginCount: 12,
  tags: ["alpha", "beta"],
  appVersion: "2.4.1",
  email: "dev@nimbus.io",
};

describe("parser", () => {
  it("parses nested groups and rejects invalid input", () => {
    const group = parseRule({
      logic: "and",
      conditions: [{ attribute: "country", operator: "equals", value: "US" }],
      groups: [{
        logic: "or",
        conditions: [
          { attribute: "plan", operator: "equals", value: "pro" },
          { attribute: "plan", operator: "equals", value: "enterprise" },
        ],
      }],
    });
    expect(group.groups?.[0]?.logic).toBe("or");
    expect(() => parseRuleGroup({ logic: "and" })).toThrow();
    expect(safeParseRuleGroup({
      logic: "and",
      conditions: [{ attribute: "x", operator: "bad", value: 1 }],
    }).success).toBe(false);
  });
});

describe("operators", () => {
  it("evaluates all supported operators", () => {
    const cases: Array<[RuleOperator, string, RuleCondition["value"], boolean]> = [
      [RuleOperator.Equals, "country", "US", true],
      [RuleOperator.NotEquals, "country", "CA", true],
      [RuleOperator.In, "country", ["US", "CA"], true],
      [RuleOperator.NotIn, "country", ["CA"], true],
      [RuleOperator.Contains, "email", "nimbus", true],
      [RuleOperator.StartsWith, "email", "dev@", true],
      [RuleOperator.EndsWith, "email", ".io", true],
      [RuleOperator.GreaterThan, "loginCount", 10, true],
      [RuleOperator.LessThan, "loginCount", 20, true],
      [RuleOperator.MatchesRegex, "email", "^dev@", true],
      [RuleOperator.SemverGte, "appVersion", "2.4.0", true],
      [RuleOperator.SemverLt, "appVersion", "3.0.0", true],
    ];
    for (const [operator, attribute, value, expected] of cases) {
      expect(evaluateCondition({ attribute, operator, value }, ctx)).toBe(expected);
    }
    expect(evaluateCondition(
      { attribute: "email", operator: RuleOperator.MatchesRegex, value: "[" },
      ctx,
    )).toBe(false);
    expect(evaluateCondition(
      { attribute: "appVersion", operator: RuleOperator.SemverGte, value: "9.0.0" },
      ctx,
    )).toBe(false);
  });
});

describe("evaluateRuleGroup", () => {
  it("short-circuits AND and OR", () => {
    expect(evaluateRuleGroup(parseRule({
      logic: "and",
      conditions: [
        { attribute: "country", operator: "equals", value: "CA" },
        { attribute: "plan", operator: "equals", value: "pro" },
      ],
    }), ctx)).toBe(false);
    expect(evaluateRuleGroup(parseRule({
      logic: "or",
      conditions: [
        { attribute: "country", operator: "equals", value: "US" },
        { attribute: "plan", operator: "equals", value: "missing" },
      ],
    }), ctx)).toBe(true);
  });

  it("evaluates NOT groups", () => {
    expect(evaluateRuleGroup(parseRule({
      logic: "not",
      groups: [{
        logic: "and",
        conditions: [{ attribute: "country", operator: "equals", value: "CA" }],
      }],
    }), ctx)).toBe(true);
    expect(evaluateRuleGroup(parseRule({
      logic: "not",
      conditions: [{ attribute: "country", operator: "equals", value: "US" }],
    }), ctx)).toBe(false);
  });
});

describe("targeting", () => {
  it("parses defaults and matches by priority", () => {
    const rule = parseTargetingRule({
      group: {
        logic: "and",
        conditions: [{ attribute: "beta", operator: "equals", value: true }],
      },
      variantKey: "treatment",
    });
    expect(rule.enabled).toBe(true);
    expect(rule.priority).toBe(0);
    const disabled = parseTargetingRule({
      id: "r1",
      enabled: false,
      priority: 1,
      group: {
        logic: "and",
        conditions: [{ attribute: "beta", operator: "equals", value: true }],
      },
    });
    expect(evaluateTargetingRule(disabled, ctx)).toBe(false);
    const low = parseTargetingRule({
      id: "low",
      priority: 1,
      group: {
        logic: "and",
        conditions: [{ attribute: "country", operator: "equals", value: "US" }],
      },
      variantKey: "low",
    });
    const high = parseTargetingRule({
      id: "high",
      priority: 10,
      group: {
        logic: "and",
        conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
      },
      variantKey: "high",
    });
    expect(evaluateTargetingRules([low, high], ctx)?.variantKey).toBe("high");
  });
});
