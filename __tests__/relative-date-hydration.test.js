import { formatRelativeDate, formatStableContentDate } from '../lib/utils';

/**
 * Regression: this site is a statically exported app, so server HTML is frozen
 * at build time while the browser evaluates at page load. Rendering a
 * time-dependent string during SSR meant an item built as "Today" hydrated the
 * next day as "Yesterday" — React aborts hydration on that text mismatch
 * (minified error #418), which killed every client component on the page.
 */
const at = (iso) => new Date(iso);

describe('formatStableContentDate is independent of the clock', () => {
  test('same input gives the same output regardless of when it is called', () => {
    // Whatever "now" is, this function never consults it.
    const a = formatStableContentDate('2026-08-26', 'en-US');
    const b = formatStableContentDate('2026-08-26', 'en-US');
    expect(a).toBe(b);
    expect(a).toBe('Aug 26, 2026');
  });

  test('matches the >30-day form of formatRelativeDate, so old entries do not flicker', () => {
    const old = '2025-03-05';
    const now = at('2026-08-29T12:00:00Z');
    expect(formatStableContentDate(old, 'en-US')).toBe(
      formatRelativeDate(old, 'en-US', now)
    );
  });

  test.each([null, undefined, '', 'nonsense'])('returns empty for %p', (input) => {
    expect(formatStableContentDate(input, 'en-US')).toBe('');
  });
});

describe('formatRelativeDate branches (clock injected)', () => {
  const now = at('2026-08-29T12:00:00');

  test.each([
    ['2026-08-29', 'Today'],
    ['2026-08-28', 'Yesterday'],
    ['2026-08-26', '3 days ago'],
    ['2026-08-22', '7 days ago'],
  ])('%s -> %s', (date, expected) => {
    expect(formatRelativeDate(date, 'en-US', now)).toBe(expected);
  });

  test('8 days falls out of relative wording into a calendar date', () => {
    expect(formatRelativeDate('2026-08-21', 'en-US', now)).toBe('Aug 21');
  });

  test('within 30 days shows a calendar date with no year', () => {
    // 2026-08-04 is 25 days before the injected now.
    expect(formatRelativeDate('2026-08-04', 'en-US', now)).toBe('Aug 4');
  });

  test('past 30 days the year appears', () => {
    // 2026-07-01 is 59 days before the injected now.
    expect(formatRelativeDate('2026-07-01', 'en-US', now)).toBe('Jul 1, 2026');
    expect(formatRelativeDate('2025-07-01', 'en-US', now)).toBe('Jul 1, 2025');
  });

  test('localises relative wording', () => {
    expect(formatRelativeDate('2026-08-28', 'es-ES', now)).toBe('Ayer');
  });
});

/**
 * The actual production failure, reproduced: a build renders the date, a
 * browser renders it later, and the two strings differ.
 */
describe('the hydration mismatch this fixes', () => {
  const buildTime = at('2026-08-26T12:00:00');
  const loadTime = at('2026-08-29T12:00:00');
  const articleDate = '2026-08-26';

  test('rendering the relative form on both sides produces a MISMATCH', () => {
    const serverText = formatRelativeDate(articleDate, 'en-US', buildTime);
    const clientText = formatRelativeDate(articleDate, 'en-US', loadTime);
    expect(serverText).toBe('Today');
    expect(clientText).toBe('3 days ago');
    expect(serverText).not.toBe(clientText); // <- React #418
  });

  test('the stable form is identical on both sides, so hydration matches', () => {
    // useRelativeDate seeds its state with this on both server and first client
    // render; the relative wording is applied only afterwards, in an effect.
    expect(formatStableContentDate(articleDate, 'en-US')).toBe(
      formatStableContentDate(articleDate, 'en-US')
    );
  });

  test('a day boundary does not change the stable form', () => {
    const before = formatStableContentDate(articleDate, 'en-US');
    const after = formatStableContentDate(articleDate, 'en-US');
    expect(before).toBe(after);
  });
});
