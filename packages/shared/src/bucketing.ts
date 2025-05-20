const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;
const R1 = 15;
const R2 = 13;
const M = 5;
const N = 0xe6546b64;
const FINALIZE_MIX_1 = 0x85ebca6b;
const FINALIZE_MIX_2 = 0xc2b2ae35;

function u32(value: number): number {
  return value >>> 0;
}

function rotl32(value: number, bits: number): number {
  return u32((value << bits) | (value >>> (32 - bits)));
}

function mul32(a: number, b: number): number {
  return u32((a & 0xffff) * b + ((((a >>> 16) * b) & 0xffff) << 16));
}

function fmix32(hash: number): number {
  let h = u32(hash);
  h ^= h >>> 16;
  h = mul32(h, FINALIZE_MIX_1);
  h ^= h >>> 13;
  h = mul32(h, FINALIZE_MIX_2);
  h ^= h >>> 16;
  return h;
}

export function murmurhash3(input: string, seed = 0): number {
  const length = input.length;
  const remainder = length & 3;
  const bytes = length - remainder;
  let hash = u32(seed);
  let i = 0;

  while (i < bytes) {
    let k =
      (input.charCodeAt(i) & 0xff) |
      ((input.charCodeAt(i + 1) & 0xff) << 8) |
      ((input.charCodeAt(i + 2) & 0xff) << 16) |
      ((input.charCodeAt(i + 3) & 0xff) << 24);
    i += 4;
    k = mul32(k, C1);
    k = rotl32(k, R1);
    k = mul32(k, C2);
    hash ^= k;
    hash = rotl32(hash, R2);
    hash = u32(mul32(hash, M) + N);
  }

  let k1 = 0;
  if (remainder === 3) {
    k1 ^= (input.charCodeAt(i + 2) & 0xff) << 16;
  }
  if (remainder >= 2) {
    k1 ^= (input.charCodeAt(i + 1) & 0xff) << 8;
  }
  if (remainder >= 1) {
    k1 ^= input.charCodeAt(i) & 0xff;
    k1 = mul32(k1, C1);
    k1 = rotl32(k1, R1);
    k1 = mul32(k1, C2);
    hash ^= k1;
  }

  hash ^= length;
  return u32(fmix32(hash));
}

export function buildBucketKey(flagKey: string, userId: string, salt: string): string {
  return `${flagKey}:${userId}:${salt}`;
}

export function bucketUser(
  flagKey: string,
  userId: string,
  salt: string,
  percentage: number,
): number {
  void percentage;
  const key = buildBucketKey(flagKey, userId, salt);
  const hash = murmurhash3(key, 0);
  return hash % 100;
}

export function isInRollout(
  flagKey: string,
  userId: string,
  salt: string,
  percentage: number,
): boolean {
  if (percentage <= 0) {
    return false;
  }
  if (percentage >= 100) {
    return true;
  }
  const bucket = bucketUser(flagKey, userId, salt, percentage);
  return bucket < percentage;
}

export function bucketUserWithSeed(
  flagKey: string,
  userId: string,
  salt: string,
  seed: number,
): number {
  const key = buildBucketKey(flagKey, userId, salt);
  const hash = murmurhash3(key, seed >>> 0);
  return hash % 100;
}

export function rolloutFraction(
  flagKey: string,
  userId: string,
  salt: string,
): number {
  const key = buildBucketKey(flagKey, userId, salt);
  const hash = murmurhash3(key, 0);
  return (hash % 10000) / 10000;
}

export const BUCKET_COUNT = 100;

export function validateRolloutPercentage(percentage: number): number {
  if (!Number.isFinite(percentage)) {
    throw new RangeError("percentage must be a finite number");
  }
  if (percentage < 0 || percentage > 100) {
    throw new RangeError("percentage must be between 0 and 100 inclusive");
  }
  return percentage;
}

export function isInRolloutSafe(
  flagKey: string,
  userId: string,
  salt: string,
  percentage: number,
): boolean {
  return isInRollout(flagKey, userId, salt, validateRolloutPercentage(percentage));
}

export function resolveStableId(
  context: Record<string, string | number | boolean | string[]>,
  attribute = "userId",
): string {
  const value = context[attribute];
  if (value === undefined || value === null) {
    return "anonymous";
  }
  if (Array.isArray(value)) {
    return value.join(",");
  }
  return String(value);
}

export function selectWeightedVariant(
  stableId: string,
  flagKey: string,
  variants: Array<{ key: string; weight?: number }>,
  salt = "",
): string | null {
  const normalized = variants.map((variant) => ({
    key: variant.key,
    weight: variant.weight ?? 0,
  }));
  const picked = assignVariantByWeight(normalized, flagKey, stableId, salt);
  return picked?.key ?? null;
}

export function assignVariantByWeight<T extends { key: string; weight: number }>(
  variants: readonly T[],
  flagKey: string,
  userId: string,
  salt: string,
): T | null {
  if (variants.length === 0) {
    return null;
  }
  const total = variants.reduce((sum, v) => sum + v.weight, 0);
  if (total <= 0) {
    return variants[0] ?? null;
  }
  const key = `${buildBucketKey(flagKey, userId, salt)}:variants`;
  const hash = murmurhash3(key, 0);
  const slot = hash % total;
  let cursor = 0;
  for (const variant of variants) {
    cursor += variant.weight;
    if (slot < cursor) {
      return variant;
    }
  }
  return variants[variants.length - 1] ?? null;
}
