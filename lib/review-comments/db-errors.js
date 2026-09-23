/**
 * Detects MongoDB connectivity failures for the review-comments API so it can
 * degrade gracefully instead of throwing an unhandled 500 on every request.
 *
 * The upstream package (@activistchecklist/react-review-comments) only checks a
 * few substrings of `error.message` and misses DNS failures such as
 * `getaddrinfo ENOTFOUND mongodb.railway.internal` — common on Railway preview
 * deployments, where the private Mongo hostname does not resolve in that
 * environment. The MongoDB driver wraps that as a `MongoServerSelectionError`
 * whose real cause is nested a couple of levels down, so we walk the whole
 * `.cause` chain and inspect `name`, `code`, and `message`.
 */

const CONNECTIVITY_ERROR_NAMES = new Set([
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoTopologyClosedError',
]);

const CONNECTIVITY_ERROR_CODES = new Set([
  'ENOTFOUND', // DNS name does not resolve (e.g. Railway internal host absent)
  'EAI_AGAIN', // transient DNS failure
  'ECONNREFUSED', // nothing listening on host:port
  'ETIMEDOUT',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

const CONNECTIVITY_MESSAGE_SIGNATURES = [
  'getaddrinfo',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ServerSelection',
  'MongoNetwork',
  'topology was destroyed',
  'connection timed out',
  'Missing REVIEW_COMMENTS_MONGODB_URL',
];

/**
 * Errors raised while *parsing* the configuration, before any socket is opened.
 * The driver throws these synchronously from `new MongoClient(url)`, so they are
 * not connectivity failures — they mean the environment variable itself is
 * wrong (a stray quote, a typo'd scheme, a Postgres URL pasted by mistake).
 */
const CONFIGURATION_ERROR_NAMES = new Set([
  'MongoParseError',
  'MongoInvalidArgumentError',
]);

const CONFIGURATION_MESSAGE_SIGNATURES = [
  'Missing REVIEW_COMMENTS_MONGODB_URL',
  'Invalid scheme',
  'Invalid connection string',
];

/**
 * Walks an error and its nested `.cause` chain into a flat array. Bounded so a
 * self-referential `cause` can't loop forever.
 */
function collectErrorChain(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current) && chain.length < 10) {
    seen.add(current);
    chain.push(current);
    current = current.cause;
  }
  return chain;
}

/**
 * True when the error (or any error in its cause chain) is a MongoDB
 * connectivity/DNS failure rather than a genuine application bug.
 */
export function isDbConnectivityError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return collectErrorChain(error).some((err) => {
    const name = String(err?.name || '');
    const code = String(err?.code || '');
    const message = String(err?.message || '');
    if (CONNECTIVITY_ERROR_NAMES.has(name)) {
      return true;
    }
    if (CONNECTIVITY_ERROR_CODES.has(code)) {
      return true;
    }
    return CONNECTIVITY_MESSAGE_SIGNATURES.some((signature) => message.includes(signature));
  });
}

/**
 * True when the error means the connection string is malformed or absent.
 *
 * Checked before {@link isDbConnectivityError} so the log line names the real
 * problem: "unreachable" sends you looking at the network, when the value in
 * the environment is what needs fixing.
 */
export function isDbConfigurationError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return collectErrorChain(error).some((err) => {
    if (CONFIGURATION_ERROR_NAMES.has(String(err?.name || ''))) {
      return true;
    }
    const message = String(err?.message || '');
    return CONFIGURATION_MESSAGE_SIGNATURES.some((signature) => message.includes(signature));
  });
}

/**
 * Extracts non-sensitive fields for logging and the response body. Never returns
 * the connection string — it holds credentials. Prefers the innermost cause that
 * actually carries a `code`/`hostname` (the network-level error), since the outer
 * MongoServerSelectionError usually has neither.
 */
export function describeDbConnectivityError(error) {
  // The chain runs outermost -> innermost, so keep overwriting to end up with
  // the innermost entry that carries either field.
  let described = {};
  for (const err of collectErrorChain(error)) {
    const code = err?.code ? String(err.code) : undefined;
    const hostname = err?.hostname ? String(err.hostname) : undefined;
    if (code || hostname) {
      described = { code, hostname };
    }
  }
  return described;
}
