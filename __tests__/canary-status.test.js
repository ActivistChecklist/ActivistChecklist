import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { canaryValidThrough, getCanaryStatus } from '../lib/canary-status.mjs';

// Shaped like scripts/canary.mjs output: the date sits on the first line of
// the clearsigned message.
function canary(stamp, { signed = true } = {}) {
  const body = `ActivistChecklist.org Warrant Canary · ${stamp}\n\nAs of some date, ActivistChecklist.org:\n`;
  if (!signed) return body;
  return [
    '-----BEGIN PGP SIGNED MESSAGE-----',
    'Hash: SHA256',
    '',
    body,
    '-----BEGIN PGP SIGNATURE-----',
    '',
    'iHUEARYIAB0WIQS3',
    '-----END PGP SIGNATURE-----',
    '',
  ].join('\n');
}

const at = (iso) => new Date(iso);

describe('getCanaryStatus', () => {
  const text = canary('2026-08-11 18:42:49 UTC');

  test('reads the signed date as UTC and is valid through 4 calendar months later', () => {
    const status = getCanaryStatus(text, at('2026-08-12T00:00:00Z'));
    expect(status.state).toBe('current');
    expect(status.updatedAt.toISOString()).toBe('2026-08-11T18:42:49.000Z');
    expect(status.validThrough.toISOString()).toBe('2026-12-11T00:00:00.000Z');
  });

  test('stays current for the whole valid-through day (UTC)', () => {
    expect(getCanaryStatus(text, at('2026-12-11T23:59:59Z')).state).toBe('current');
  });

  test('is overdue from the next day', () => {
    expect(getCanaryStatus(text, at('2026-12-12T00:00:00Z')).state).toBe('overdue');
    expect(getCanaryStatus(text, at('2027-06-01T00:00:00Z')).state).toBe('overdue');
  });

  test('a canary dated after "now" (visitor clock behind) counts as current', () => {
    expect(getCanaryStatus(text, at('2026-01-01T00:00:00Z')).state).toBe('current');
  });

  test('a canary signed late in the UTC day is still valid through that day 4 months on', () => {
    const lateNight = canary('2026-08-11 23:59:59 UTC');
    expect(getCanaryStatus(lateNight).validThrough.toISOString()).toBe('2026-12-11T00:00:00.000Z');
  });

  test('crosses a year boundary', () => {
    const november = canary('2026-11-15 00:00:00 UTC');
    expect(getCanaryStatus(november, at('2027-03-15T23:59:59Z')).state).toBe('current');
    expect(getCanaryStatus(november, at('2027-03-16T00:00:00Z')).state).toBe('overdue');
  });

  test.each([
    ['an unsigned file', canary('2026-08-11 18:42:49 UTC', { signed: false })],
    [
      'a date outside the signed part',
      `${canary('not a date')}Warrant Canary · 2026-08-11 18:42:49 UTC\n`,
    ],
    ['no date line', canary('sometime soon')],
    ['an impossible date', canary('2026-13-45 99:00:00 UTC')],
    ['an HTML error page', '<!doctype html><title>404</title>'],
    ['an empty file', ''],
    ['a non-string', undefined],
  ])('is unknown for %s', (_label, input) => {
    expect(getCanaryStatus(input, at('2026-08-12T00:00:00Z'))).toEqual({ state: 'unknown' });
  });

  test('can read the canary we actually publish', () => {
    // Guards against scripts/canary.mjs changing its format without this
    // parser following, which would quietly hide the status on the site.
    const published = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'files', 'canary.txt'),
      'utf8',
    );
    expect(getCanaryStatus(published).state).not.toBe('unknown');
  });
});

// scripts/canary.mjs writes this date into the signed canary as "valid through",
// so it has to match what the page shows.
describe('canaryValidThrough', () => {
  test.each([
    ['2026-08-11T18:42:49Z', '2026-12-11'],
    // a shorter month clamps to its last day instead of rolling into the next
    ['2026-10-31T12:00:00Z', '2027-02-28'],
    ['2027-10-31T12:00:00Z', '2028-02-29'],
    ['2026-03-31T12:00:00Z', '2026-07-31'],
  ])('signed %s is valid through %s', (signed, expected) => {
    expect(canaryValidThrough(new Date(signed)).toISOString().slice(0, 10)).toBe(expected);
  });
});
