import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MONTHS, staleReviewDate } from '../lib/content-staleness';

describe('staleReviewDate', () => {
  // Local midnight, so the boundary cases don't shift with the test's timezone.
  const now = new Date(2026, 9, 15);

  it('uses a 12 month threshold', () => {
    expect(STALE_AFTER_MONTHS).toBe(12);
  });

  it('flags a date just past the threshold', () => {
    expect(staleReviewDate('2025-10-14', now)).toBe('2025-10-14');
  });

  it('does not flag a date exactly at or just within the threshold', () => {
    expect(staleReviewDate('2025-10-15', now)).toBeNull();
    expect(staleReviewDate('2025-10-16', now)).toBeNull();
  });

  it('does not flag a recent date', () => {
    expect(staleReviewDate('2026-10-01', now)).toBeNull();
  });

  it('accepts the Date that gray-matter parses from unquoted YAML', () => {
    expect(staleReviewDate(new Date('2025-02-24'), now)).toBe('2025-02-24');
    expect(staleReviewDate(new Date('2026-01-28'), now)).toBeNull();
  });

  it('does not flag missing or unparseable dates', () => {
    expect(staleReviewDate(undefined, now)).toBeNull();
    expect(staleReviewDate('', now)).toBeNull();
    expect(staleReviewDate('not a date', now)).toBeNull();
    expect(staleReviewDate(new Date('nope'), now)).toBeNull();
  });
});
