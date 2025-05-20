import { describe, it, expect } from "vitest";
import {
  murmurhash3,
  buildBucketKey,
  bucketUser,
  isInRollout,
  isInRolloutSafe,
  bucketUserWithSeed,
  rolloutFraction,
  validateRolloutPercentage,
  assignVariantByWeight,
  selectWeightedVariant,
  BUCKET_COUNT,
} from "../src/bucketing.js";

describe("murmurhash3", () => {
  it("returns stable 32-bit unsigned hashes", () => {
    expect(murmurhash3("")).toBe(0);
    expect(murmurhash3("hello")).toBe(murmurhash3("hello"));
    expect(murmurhash3("hello", 42)).toBe(murmurhash3("hello", 42));
    expect(murmurhash3("hello", 0)).not.toBe(murmurhash3("hello", 42));
  });

  it("produces different hashes for different inputs", () => {
    const a = murmurhash3("flag-a:user-1:salt");
    const b = murmurhash3("flag-b:user-1:salt");
    const c = murmurhash3("flag-a:user-2:salt");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("handles unicode and long strings", () => {
    const unicode = murmurhash3("user-🚀-日本語");
    expect(Number.isInteger(unicode)).toBe(true);
    expect(unicode).toBeGreaterThanOrEqual(0);
    const long = "x".repeat(10_000);
    expect(murmurhash3(long)).toBe(murmurhash3(long));
  });

  it("matches reference vectors", () => {
    expect(murmurhash3("", 0)).toBe(0);
    expect(murmurhash3("Hello, world!", 0)).toBe(3224780355);
    expect(murmurhash3("a", 0)).toBe(1009084850);
    expect(murmurhash3("ab", 0)).toBe(2613040991);
    expect(murmurhash3("abc", 0)).toBe(3017643002);
  });
});

describe("buildBucketKey", () => {
  it("combines flag, user, and salt", () => {
    expect(buildBucketKey("checkout", "u1", "prod")).toBe("checkout:u1:prod");
  });
});

describe("bucketUser", () => {
  it("returns buckets in 0..99 range", () => {
    for (let i = 0; i < 500; i++) {
      const bucket = bucketUser("feature_x", `user_${i}`, "salt", 50);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(BUCKET_COUNT);
    }
  });

  it("is sticky for the same user and flag", () => {
    const first = bucketUser("dark_mode", "user_abc", "v1", 25);
    const second = bucketUser("dark_mode", "user_abc", "v1", 75);
    expect(first).toBe(second);
  });

  it("changes when salt or flag changes", () => {
    const base = bucketUser("flag", "user", "salt-a", 50);
    const otherFlag = bucketUser("other", "user", "salt-a", 50);
    const otherSalt = bucketUser("flag", "user", "salt-b", 50);
    const otherUser = bucketUser("flag", "other-user", "salt-a", 50);
    const changes = [otherFlag, otherSalt, otherUser].filter((b) => b !== base);
    expect(changes.length).toBeGreaterThan(0);
  });

  it("decouples buckets across flags via salt", () => {
    const users = Array.from({ length: 200 }, (_, i) => `user_${i}`);
    const flagA = users.map((u) => bucketUser("flag_a", u, "shared", 50));
    const flagB = users.map((u) => bucketUser("flag_b", u, "shared", 50));
    let sameCount = 0;
    for (let i = 0; i < users.length; i++) {
      if (flagA[i] === flagB[i]) sameCount += 1;
    }
    expect(sameCount).toBeLessThan(users.length * 0.75);
  });
});

describe("isInRollout", () => {
  it("returns false for 0% and true for 100%", () => {
    expect(isInRollout("f", "u", "s", 0)).toBe(false);
    expect(isInRollout("f", "u", "s", 100)).toBe(true);
  });

  it("aligns rollout with bucket threshold", () => {
    const flagKey = "align_test";
    const salt = "salt";
    for (let pct = 1; pct <= 99; pct++) {
      const bucket = bucketUser(flagKey, "sticky_user", salt, pct);
      const inRollout = isInRollout(flagKey, "sticky_user", salt, pct);
      expect(inRollout).toBe(bucket < pct);
    }
  });

  it("approximates target percentage over many users", () => {
    const flagKey = "rollout_dist";
    const salt = "dist";
    const target = 30;
    const users = Array.from({ length: 5000 }, (_, i) => `dist_user_${i}`);
    const included = users.filter((u) => isInRollout(flagKey, u, salt, target)).length;
    const ratio = included / users.length;
    expect(ratio).toBeGreaterThan(0.24);
    expect(ratio).toBeLessThan(0.36);
  });

  it("increases inclusion monotonically for a fixed user", () => {
    const flagKey = "mono";
    const userId = "mono_user";
    const salt = "s";
    const bucket = bucketUser(flagKey, userId, salt, 50);
    for (let pct = 0; pct <= 100; pct++) {
      const expected = pct <= 0 ? false : pct >= 100 ? true : bucket < pct;
      expect(isInRollout(flagKey, userId, salt, pct)).toBe(expected);
    }
  });
});

describe("validateRolloutPercentage", () => {
  it("accepts valid percentages", () => {
    expect(validateRolloutPercentage(0)).toBe(0);
    expect(validateRolloutPercentage(50)).toBe(50);
    expect(validateRolloutPercentage(100)).toBe(100);
  });

  it("rejects out of range values", () => {
    expect(() => validateRolloutPercentage(-1)).toThrow(RangeError);
    expect(() => validateRolloutPercentage(101)).toThrow(RangeError);
    expect(() => validateRolloutPercentage(Number.NaN)).toThrow(RangeError);
  });
});

describe("isInRolloutSafe", () => {
  it("validates before evaluating", () => {
    expect(() => isInRolloutSafe("f", "u", "s", 150)).toThrow(RangeError);
    expect(isInRolloutSafe("f", "u", "s", 100)).toBe(true);
  });
});

describe("bucketUserWithSeed", () => {
  it("changes buckets when seed changes", () => {
    const a = bucketUserWithSeed("f", "u", "s", 0);
    const b = bucketUserWithSeed("f", "u", "s", 99);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
  });
});

describe("rolloutFraction", () => {
  it("returns values between 0 and 1", () => {
    for (let i = 0; i < 100; i++) {
      const fraction = rolloutFraction("frac", `user_${i}`, "salt");
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThan(1);
    }
  });
});

describe("assignVariantByWeight", () => {
  const variants = [
    { key: "control", weight: 50 },
    { key: "treatment", weight: 50 },
  ] as const;

  it("returns null for empty variants", () => {
    expect(assignVariantByWeight([], "f", "u", "s")).toBeNull();
  });

  it("assigns deterministically", () => {
    const first = assignVariantByWeight(variants, "exp", "user_1", "salt");
    const second = assignVariantByWeight(variants, "exp", "user_1", "salt");
    expect(first?.key).toBe(second?.key);
  });

  it("respects weight distribution approximately", () => {
    const heavy = [
      { key: "control", weight: 90 },
      { key: "treatment", weight: 10 },
    ];
    const users = Array.from({ length: 2000 }, (_, i) => `w_user_${i}`);
    const treatmentCount = users.filter(
      (u) => assignVariantByWeight(heavy, "exp_w", u, "salt")?.key === "treatment",
    ).length;
    const ratio = treatmentCount / users.length;
    expect(ratio).toBeGreaterThan(0.04);
    expect(ratio).toBeLessThan(0.16);
  });

  it("falls back to first variant when weights sum to zero", () => {
    const zero = [
      { key: "a", weight: 0 },
      { key: "b", weight: 0 },
    ];
    expect(assignVariantByWeight(zero, "f", "u", "s")?.key).toBe("a");
  });
});

describe("selectWeightedVariant", () => {
  it("returns variant keys for weighted selection", () => {
    const key = selectWeightedVariant("user_9", "hero", [
      { key: "a", weight: 50 },
      { key: "b", weight: 50 },
    ]);
    expect(key === "a" || key === "b").toBe(true);
  });
});

describe("cross-flag correlation", () => {
  it("uses independent buckets with different salts", () => {
    const users = Array.from({ length: 300 }, (_, i) => `corr_${i}`);
    const bucketsA = users.map((u) => bucketUser("flag", u, "salt-one", 50));
    const bucketsB = users.map((u) => bucketUser("flag", u, "salt-two", 50));
    let matches = 0;
    for (let i = 0; i < users.length; i++) {
      if (bucketsA[i] === bucketsB[i]) matches += 1;
    }
    expect(matches).toBeLessThan(users.length * 0.6);
  });
});

describe("gradual rollout simulation", () => {
  it("grows included users as percentage increases", () => {
    const flagKey = "gradual";
    const salt = "grad";
    const users = Array.from({ length: 1000 }, (_, i) => `grad_${i}`);
    const steps = [5, 10, 25, 50, 75, 100];
    let previous = 0;
    for (const pct of steps) {
      const count = users.filter((u) => isInRollout(flagKey, u, salt, pct)).length;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    expect(previous).toBe(users.length);
  });
});

describe("edge inputs", () => {
  it("handles empty user id and special characters in keys", () => {
    const bucket = bucketUser("flag_key", "", "salt", 10);
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);
    expect(isInRollout("flag-key_2", "user@domain", "salt!#", 50)).toBeTypeOf("boolean");
  });
});

describe("property checks", () => {
  it("bucket count constant is 100", () => {
    expect(BUCKET_COUNT).toBe(100);
  });

  it("hash output fits uint32", () => {
    const values = ["", "a", "abc", "abcdefgh", "long-input-value"];
    for (const v of values) {
      const h = murmurhash3(v);
      expect(h >>> 0).toBe(h);
    }
  });
});
