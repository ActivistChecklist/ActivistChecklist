import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { formatMonthYear } from '../lib/updates/format-date';

// The bug this module exists to prevent only reproduces west of UTC, so pin the
// process to a negative-offset zone for this file. Node applies a runtime TZ change
// to subsequent Date formatting; the explicit-timeZone test below covers the same
// contract without depending on that, in case a future runtime caches the default.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/New_York'; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

describe('formatMonthYear', () => {
  it('keeps the stored month for a viewer west of UTC', () => {
    // "2024-11-01" parses as UTC midnight, which is 2024-10-31 19:00 in New York.
    // Formatted in local time this reads "October 2024" — the MacBook Pro whose
    // marketing name says "Nov 2024" was being shown as an October machine.
    expect(formatMonthYear('2024-11-01', 'en-US')).toBe('November 2024');
  });

  it('is immune to the viewer timezone, not merely correct in UTC', () => {
    // Pinned without relying on the runtime TZ switch above: an explicitly
    // New-York-formatted copy of the same instant lands in the previous month,
    // which is exactly what the helper must not do.
    const localised = new Date('2024-11-01').toLocaleDateString('en-US', {
      month: 'long', year: 'numeric', timeZone: 'America/New_York',
    });
    expect(localised).toBe('October 2024');
    expect(formatMonthYear('2024-11-01', 'en-US')).not.toBe(localised);
  });

  it('handles the first of January, where the shift also crosses the year', () => {
    expect(formatMonthYear('2015-01-01', 'en-US')).toBe('January 2015');
  });

  it('leaves mid-month dates alone', () => {
    expect(formatMonthYear('2025-09-15', 'en-US')).toBe('September 2025');
  });

  it('localizes the month name', () => {
    expect(formatMonthYear('2026-10-01', 'es')).toMatch(/octubre/i);
  });

  it('returns an empty string for a missing date', () => {
    expect(formatMonthYear(null, 'en-US')).toBe('');
    expect(formatMonthYear(undefined, 'en-US')).toBe('');
    expect(formatMonthYear('', 'en-US')).toBe('');
  });

  it('echoes back anything it cannot parse rather than printing Invalid Date', () => {
    expect(formatMonthYear('not a date', 'en-US')).toBe('not a date');
  });

  it('defaults to en-US when no locale is passed', () => {
    expect(formatMonthYear('2024-11-01')).toBe('November 2024');
  });
});
