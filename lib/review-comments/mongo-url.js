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
 * Quote characters that a connection string may arrive wrapped in.
 *
 * Railway's dashboard renders a variable's value inside backticks, so copying
 * a Mongo URL out of it and pasting it into another service's variable is very
 * easy to do *with* the backticks attached. The driver then rejects the whole
 * value with `MongoParseError: Invalid scheme` and every review-comments
 * request 500s. Shell-style quotes get pasted in the same way.
 */
const ENCLOSING_QUOTE_PAIRS = [
  ['`', '`'],
  ['"', '"'],
  ["'", "'"],
];

/**
 * Trims surrounding whitespace and one layer of matching enclosing quotes.
 *
 * Only strips when *both* ends match, so a quote inside a password is left
 * alone. A legitimate connection string always starts with `mongodb`, so a
 * leading quote is never meaningful.
 */
export function stripEnclosingQuotes(value) {
  if (typeof value !== 'string') {
    return value;
  }
  let out = value.trim();
  for (const [open, close] of ENCLOSING_QUOTE_PAIRS) {
    if (out.length >= 2 && out.startsWith(open) && out.endsWith(close)) {
      out = out.slice(1, -1).trim();
      break;
    }
  }
  return out;
}

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
 * Full normalisation applied to the configured connection string: unwrap stray
 * quotes, then bound server selection.
 */
export function normalizeConnectionString(connectionString) {
  return withServerSelectionTimeout(stripEnclosingQuotes(connectionString));
}

/**
 * Normalises `REVIEW_COMMENTS_MONGODB_URL` in place.
 *
 * Mutating env is not lovely, but the package reads the variable directly and
 * caches its client on first connect, so normalising the value before the first
 * request is the only hook available.
 */
export function applyMongoTimeoutToEnv(env = process.env) {
  const current = env.REVIEW_COMMENTS_MONGODB_URL;
  if (!current) return current;
  const next = normalizeConnectionString(current);
  env.REVIEW_COMMENTS_MONGODB_URL = next;
  return next;
}
