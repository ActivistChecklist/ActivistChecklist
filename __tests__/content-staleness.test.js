import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MONTHS, getGuideStaleness } from '../lib/content-staleness';

describe('getGuideStaleness', () => {
  // Local midnight, so the boundary cases don't shift with the test's timezone.
  const now = new Date(2026, 9, 15);

  it('uses a 12 month threshold', () => {
    expect(STALE_AFTER_MONTHS).toBe(12);
  });

  it('flags a date just past the threshold as 1 year old', () => {
    expect(getGuideStaleness('2025-10-14', now)).toEqual({
      reviewDate: '2025-10-14',
      yearsOld: 1,
    });
  });

  it('does not flag a date exactly at or just within the threshold', () => {
    expect(getGuideStaleness('2025-10-15', now)).toBeNull();
    expect(getGuideStaleness('2025-10-16', now)).toBeNull();
  });

  it('does not flag a recent date', () => {
    expect(getGuideStaleness('2026-10-01', now)).toBeNull();
  });

  it('counts whole years, rolling over on the anniversary', () => {
    expect(getGuideStaleness('2024-10-16', now).yearsOld).toBe(1);
    expect(getGuideStaleness('2024-10-15', now).yearsOld).toBe(2);
    expect(getGuideStaleness('2021-03-01', now).yearsOld).toBe(5);
  });

  it('accepts the Date that gray-matter parses from unquoted YAML', () => {
    expect(getGuideStaleness(new Date('2025-02-24'), now)).toEqual({
      reviewDate: '2025-02-24',
      yearsOld: 1,
    });
    expect(getGuideStaleness(new Date('2026-01-28'), now)).toBeNull();
  });

  it('does not flag missing or unparseable dates', () => {
    expect(getGuideStaleness(undefined, now)).toBeNull();
    expect(getGuideStaleness('', now)).toBeNull();
    expect(getGuideStaleness('not a date', now)).toBeNull();
    expect(getGuideStaleness(new Date('nope'), now)).toBeNull();
  });
});
