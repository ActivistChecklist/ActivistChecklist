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

export function isAnnotationsEnabled(env = process.env) {
  if (env.BUILD_MODE === 'static') {
    return false;
  }
  if (!isTrue(env.ANNOTATIONS_ENABLED || '')) {
    return false;
  }
  if (isRailwayRuntime(env)) {
    return true;
  }
  // Local `yarn dev`: same flag, no Railway vars required (Postgres via DATABASE_URL).
  if (env.NODE_ENV === 'development') {
    return true;
  }
  return false;
}

export function getAnnotationsConfig(env = process.env) {
  const repoFullName = (env.RAILWAY_GIT_REPO_FULL_NAME || env.ANNOTATIONS_REPO_FULL_NAME || '').trim();
  const prNumber = (env.RAILWAY_GIT_PR_NUMBER || env.ANNOTATIONS_PR_NUMBER || '').trim();
  const deploymentKey = (
    env.RAILWAY_DEPLOYMENT_ID ||
    env.RAILWAY_PUBLIC_DOMAIN ||
    env.RAILWAY_ENVIRONMENT_NAME ||
    env.ANNOTATIONS_DEPLOYMENT_KEY ||
    ''
  ).trim();
  const scopeKey = [repoFullName, prNumber, deploymentKey].filter(Boolean).join(':');

  return {
    enabled: isAnnotationsEnabled(env),
    publicReadWrite: isTrue(env.ANNOTATIONS_PUBLIC_WRITE || 'true'),
    scope: {
      scopeKey: scopeKey || 'unknown',
      repoFullName: repoFullName || 'unknown',
      prNumber: prNumber || 'unknown',
      deploymentKey: deploymentKey || 'unknown',
    },
  };
}
