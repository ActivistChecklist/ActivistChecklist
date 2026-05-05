const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isTrue(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return TRUE_VALUES.has(value.toLowerCase());
}

function isRailwayRuntime(env = process.env) {
  return Boolean(
    env.RAILWAY_PROJECT_ID ||
    env.RAILWAY_ENVIRONMENT ||
    env.RAILWAY_ENVIRONMENT_NAME ||
    env.RAILWAY_PUBLIC_DOMAIN
  );
}

/**
 * ActivistChecklist-only: when to expose review comments in the UI and API.
 * Scope (preview vs production, etc.) is keyed by the HTTP Host the user sees — see
 * `reviewCommentsScopeFromHostHeader` in @activistchecklist/react-review-comments.
 */
export function isReviewCommentsEnabled(env = process.env) {
  if (env.BUILD_MODE === 'static') {
    return false;
  }
  if (!isTrue(env.REVIEW_COMMENTS_ENABLED || '')) {
    return false;
  }
  if (isRailwayRuntime(env)) {
    return true;
  }
  if (env.NODE_ENV === 'development') {
    return true;
  }
  return false;
}

/**
 * Feature flags for the stock handler (`getReviewCommentsRuntimeConfig`).
 * Document scope is **not** set here; the API derives it from `Host` / `X-Forwarded-Host`.
 */
export function getReviewCommentsConfig(env = process.env) {
  return {
    enabled: isReviewCommentsEnabled(env),
    publicReadWrite: isTrue(env.REVIEW_COMMENTS_PUBLIC_WRITE || 'true'),
  };
}
