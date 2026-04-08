const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isTrue(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return TRUE_VALUES.has(value.toLowerCase());
}

/**
 * Default enablement for the stock API handler: static export off, REVIEW_COMMENTS_ENABLED on.
 * Host apps can override by passing `getReviewCommentsRuntimeConfig` to `handleReviewCommentsRequest`.
 */
export function isReviewCommentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.BUILD_MODE === 'static') {
    return false;
  }
  return isTrue(env.REVIEW_COMMENTS_ENABLED || '');
}

export interface ReviewCommentsRuntimeConfig {
  enabled: boolean;
  publicReadWrite: boolean;
}

/**
 * Default runtime config for the stock handler (feature flag + public write only).
 * Document scope is derived from the HTTP `Host` / `X-Forwarded-Host` on each request.
 */
export function getReviewCommentsRuntimeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ReviewCommentsRuntimeConfig {
  return {
    enabled: isReviewCommentsEnabled(env),
    publicReadWrite: isTrue(env.REVIEW_COMMENTS_PUBLIC_WRITE || 'true'),
  };
}
