import { describe, it, expect } from "vitest";
import {
  evaluateRollout,
  evaluateRolloutForFlag,
  userInRollout,
  rolloutCoverageEstimate,
  hashUserForFlag,
} from "../src/evaluation/bucketing.js";

describe("server rollout evaluation", () => {
  it("evaluates rollout with bucket metadata", () => {
    const result = evaluateRollout({
      flagKey: "pricing",
      userId: "user_99",
      salt: "prod",
      percentage: 40,
    });
    expect(result.flagKey).toBe("pricing");
    expect(result.userId).toBe("user_99");
    expect(result.bucket).toBeGreaterThanOrEqual(0);
    expect(result.bucket).toBeLessThan(100);
    expect(result.inRollout).toBe(result.bucket < 40);
    expect(result.bucketKey).toContain("pricing");
  });

  it("wraps flag evaluation helper", () => {
    const result = evaluateRolloutForFlag("banner", "u1", "salt", 100);
    expect(result.inRollout).toBe(true);
  });

  it("uses safe rollout check", () => {
    expect(userInRollout("f", "u", "s", 0)).toBe(false);
    expect(userInRollout("f", "u", "s", 100)).toBe(true);
  });

  it("estimates coverage across users", () => {
    const users = Array.from({ length: 500 }, (_, i) => `cov_${i}`);
    const coverage = rolloutCoverageEstimate("cov_flag", users, "salt", 25);
    expect(coverage).toBeGreaterThan(0.15);
    expect(coverage).toBeLessThan(0.35);
  });

  it("hashes consistently", () => {
    const a = hashUserForFlag("f", "u", "s");
    const b = hashUserForFlag("f", "u", "s");
    expect(a).toBe(b);
  });
});
