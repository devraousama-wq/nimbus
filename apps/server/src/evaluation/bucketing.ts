import {
  bucketUser,
  isInRollout,
  isInRolloutSafe,
  murmurhash3,
  buildBucketKey,
  assignVariantByWeight,
  validateRolloutPercentage,
  rolloutFraction,
  BUCKET_COUNT,
} from "@nimbus/shared";

export type RolloutEvaluationInput = {
  flagKey: string;
  userId: string;
  salt: string;
  percentage: number;
};

export type RolloutEvaluationResult = {
  flagKey: string;
  userId: string;
  bucket: number;
  inRollout: boolean;
  percentage: number;
  bucketKey: string;
};

export function evaluateRollout(input: RolloutEvaluationInput): RolloutEvaluationResult {
  const percentage = validateRolloutPercentage(input.percentage);
  const bucketKey = buildBucketKey(input.flagKey, input.userId, input.salt);
  const bucket = bucketUser(input.flagKey, input.userId, input.salt, percentage);
  const inRollout = isInRollout(input.flagKey, input.userId, input.salt, percentage);
  return {
    flagKey: input.flagKey,
    userId: input.userId,
    bucket,
    inRollout,
    percentage,
    bucketKey,
  };
}

export function evaluateRolloutForFlag(
  flagKey: string,
  userId: string,
  salt: string,
  percentage: number,
): RolloutEvaluationResult {
  return evaluateRollout({ flagKey, userId, salt, percentage });
}

export function hashUserForFlag(flagKey: string, userId: string, salt: string): number {
  return murmurhash3(buildBucketKey(flagKey, userId, salt), 0);
}

export function userInRollout(
  flagKey: string,
  userId: string,
  salt: string,
  percentage: number,
): boolean {
  return isInRolloutSafe(flagKey, userId, salt, percentage);
}

export function assignExperimentVariant<T extends { key: string; weight: number }>(
  flagKey: string,
  userId: string,
  salt: string,
  variants: readonly T[],
): T | null {
  return assignVariantByWeight(variants, flagKey, userId, salt);
}

export function rolloutCoverageEstimate(
  flagKey: string,
  userIds: readonly string[],
  salt: string,
  percentage: number,
): number {
  if (userIds.length === 0) {
    return 0;
  }
  let count = 0;
  for (const userId of userIds) {
    if (isInRollout(flagKey, userId, salt, percentage)) {
      count += 1;
    }
  }
  return count / userIds.length;
}

export { bucketUser, isInRollout, murmurhash3, buildBucketKey, rolloutFraction };
export { BUCKET_COUNT };
