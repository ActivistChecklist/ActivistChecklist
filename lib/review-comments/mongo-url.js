/**
 * MongoDB's default `serverSelectionTimeoutMS` is 30 seconds. When the database
 * is unreachable — a stopped local container, or a Railway preview where the
 * private Mongo host does not resolve — every review-comments request holds a
 * browser connection for that full 30s before degrading.
 *
 * Browsers allow ~6 concurrent connections per origin, so a couple of those in
 * flight starve the rest of the page. That is what made local dev feel broken:
 * the bundler was fine, the connection pool was not.
 *
 * The upstream package builds its client as `new MongoClient(connectionString)`
 * with no options and reads the string straight from
 * `REVIEW_COMMENTS_MONGODB_URL`, so the connection string is the only place we
 * can set this without an upstream change.
 */

/** Long enough for a healthy connection, short enough to fail fast. */
export const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 3000;

/**
 * Returns `connectionString` with `serverSelectionTimeoutMS` applied.
 *
 * An explicit value already in the string always wins, so an environment can
 * still opt out. Anything unparseable is returned untouched rather than risking
 * corrupting a connection string we do not understand.
 */
export function withServerSelectionTimeout(
  connectionString,
  timeoutMs = DEFAULT_SERVER_SELECTION_TIMEOUT_MS
) {
  if (typeof connectionString !== 'string' || connectionString === '') {
    return connectionString;
  }

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    return connectionString;
  }

  if (!parsed.protocol.startsWith('mongodb')) {
    return connectionString;
  }

  if (parsed.searchParams.has('serverSelectionTimeoutMS')) {
    return connectionString;
  }

  parsed.searchParams.set('serverSelectionTimeoutMS', String(timeoutMs));
  return parsed.toString();
}

/**
 * Applies the timeout to `REVIEW_COMMENTS_MONGODB_URL` in place.
 *
 * Mutating env is not lovely, but the package reads the variable directly and
 * caches its client on first connect, so normalising the value before the first
 * request is the only hook available.
 */
export function applyMongoTimeoutToEnv(env = process.env) {
  const current = env.REVIEW_COMMENTS_MONGODB_URL;
  if (!current) return current;
  const next = withServerSelectionTimeout(current);
  env.REVIEW_COMMENTS_MONGODB_URL = next;
  return next;
}
