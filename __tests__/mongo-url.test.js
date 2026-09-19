import {
  withServerSelectionTimeout,
  applyMongoTimeoutToEnv,
  DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
} from '../lib/review-comments/mongo-url';

const timeoutOf = (url) =>
  new URL(url).searchParams.get('serverSelectionTimeoutMS');

describe('withServerSelectionTimeout', () => {
  test('adds the timeout to a plain connection string', () => {
    const out = withServerSelectionTimeout('mongodb://localhost:27017/reviews');
    expect(timeoutOf(out)).toBe(String(DEFAULT_SERVER_SELECTION_TIMEOUT_MS));
  });

  test('keeps the database name, which the package parses from the path', () => {
    const out = withServerSelectionTimeout('mongodb://localhost:27017/reviews');
    expect(new URL(out).pathname).toBe('/reviews');
  });

  test('preserves credentials and existing query params on an srv URL', () => {
    const out = withServerSelectionTimeout(
      'mongodb+srv://user:pass@host/db?retryWrites=true'
    );
    const u = new URL(out);
    expect(u.username).toBe('user');
    expect(u.password).toBe('pass');
    expect(u.searchParams.get('retryWrites')).toBe('true');
    expect(timeoutOf(out)).toBe(String(DEFAULT_SERVER_SELECTION_TIMEOUT_MS));
  });

  test('an explicit value wins so an environment can opt out', () => {
    const url = 'mongodb://h/db?serverSelectionTimeoutMS=99';
    expect(withServerSelectionTimeout(url)).toBe(url);
  });

  test('honours an explicit zero rather than treating it as unset', () => {
    const url = 'mongodb://h/db?serverSelectionTimeoutMS=0';
    expect(withServerSelectionTimeout(url)).toBe(url);
  });

  test('accepts a custom timeout', () => {
    expect(timeoutOf(withServerSelectionTimeout('mongodb://h/db', 1500))).toBe('1500');
  });

  test.each([
    ['', ''],
    [undefined, undefined],
    [null, null],
  ])('passes through empty value %p untouched', (input, expected) => {
    expect(withServerSelectionTimeout(input)).toBe(expected);
  });

  test('leaves an unparseable string alone rather than corrupting it', () => {
    expect(withServerSelectionTimeout('not a url')).toBe('not a url');
  });

  test('ignores non-mongodb schemes', () => {
    expect(withServerSelectionTimeout('https://example.com/db')).toBe(
      'https://example.com/db'
    );
  });

  test('is idempotent', () => {
    const once = withServerSelectionTimeout('mongodb://h/db');
    expect(withServerSelectionTimeout(once)).toBe(once);
  });
});

describe('applyMongoTimeoutToEnv', () => {
  test('rewrites the variable the package reads', () => {
    const env = { REVIEW_COMMENTS_MONGODB_URL: 'mongodb://localhost:27017/reviews' };
    applyMongoTimeoutToEnv(env);
    expect(timeoutOf(env.REVIEW_COMMENTS_MONGODB_URL)).toBe(
      String(DEFAULT_SERVER_SELECTION_TIMEOUT_MS)
    );
  });

  test('does nothing when the variable is unset', () => {
    const env = {};
    applyMongoTimeoutToEnv(env);
    expect(env.REVIEW_COMMENTS_MONGODB_URL).toBeUndefined();
  });

  test('is safe to call more than once (route module may re-evaluate)', () => {
    const env = { REVIEW_COMMENTS_MONGODB_URL: 'mongodb://h/db' };
    applyMongoTimeoutToEnv(env);
    const first = env.REVIEW_COMMENTS_MONGODB_URL;
    applyMongoTimeoutToEnv(env);
    expect(env.REVIEW_COMMENTS_MONGODB_URL).toBe(first);
  });
});
