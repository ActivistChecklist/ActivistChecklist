import {
  withServerSelectionTimeout,
  applyMongoTimeoutToEnv,
  stripEnclosingQuotes,
  normalizeConnectionString,
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

describe('stripEnclosingQuotes', () => {
  // The real incident: Railway shows a variable's value wrapped in backticks,
  // and the value was pasted into another service's variable with them attached.
  test('unwraps the backticks Railway renders around a value', () => {
    expect(stripEnclosingQuotes('`mongodb://mongo:pw@mongodb.railway.internal:27017`')).toBe(
      'mongodb://mongo:pw@mongodb.railway.internal:27017'
    );
  });

  test.each([
    ['"mongodb://h/db"', 'mongodb://h/db'],
    ["'mongodb://h/db'", 'mongodb://h/db'],
    ['  mongodb://h/db\n', 'mongodb://h/db'],
    ['  `mongodb://h/db`  ', 'mongodb://h/db'],
  ])('normalises %p', (input, expected) => {
    expect(stripEnclosingQuotes(input)).toBe(expected);
  });

  test('leaves an already-clean string untouched', () => {
    expect(stripEnclosingQuotes('mongodb://h/db')).toBe('mongodb://h/db');
  });

  test('does not strip when only one end is quoted', () => {
    expect(stripEnclosingQuotes('`mongodb://h/db')).toBe('`mongodb://h/db');
    expect(stripEnclosingQuotes('mongodb://h/db`')).toBe('mongodb://h/db`');
  });

  test('leaves a quote that is part of a password alone', () => {
    const url = "mongodb://user:pa'ss@h/db";
    expect(stripEnclosingQuotes(url)).toBe(url);
  });

  test('strips only one layer, so a doubly wrapped value is still reported as broken', () => {
    expect(stripEnclosingQuotes('``mongodb://h/db``')).toBe('`mongodb://h/db`');
  });

  test.each([[undefined], [null], [42]])('passes through non-string %p', (input) => {
    expect(stripEnclosingQuotes(input)).toBe(input);
  });
});

describe('normalizeConnectionString', () => {
  test('a backticked URL becomes usable and gains the timeout', () => {
    const out = normalizeConnectionString('`mongodb://mongo:pw@mongodb.railway.internal:27017`');
    const u = new URL(out);
    expect(u.protocol).toBe('mongodb:');
    expect(u.hostname).toBe('mongodb.railway.internal');
    expect(u.password).toBe('pw');
    expect(timeoutOf(out)).toBe(String(DEFAULT_SERVER_SELECTION_TIMEOUT_MS));
  });
});

describe('applyMongoTimeoutToEnv (quoted values)', () => {
  test('repairs the backticked value the package would otherwise reject', () => {
    const env = {
      REVIEW_COMMENTS_MONGODB_URL: '`mongodb://mongo:pw@mongodb.railway.internal:27017`',
    };
    applyMongoTimeoutToEnv(env);
    expect(env.REVIEW_COMMENTS_MONGODB_URL.startsWith('mongodb://')).toBe(true);
    expect(env.REVIEW_COMMENTS_MONGODB_URL).not.toContain('`');
  });
});
