import { describe, it, expect } from 'vitest';
import { parseShowCount } from '../lib/expandable-list';

describe('parseShowCount', () => {
  it('defaults to 1 when show is missing or blank', () => {
    expect(parseShowCount(undefined)).toBe(1);
    expect(parseShowCount('')).toBe(1);
  });

  it('reads a whole number from the string attribute', () => {
    expect(parseShowCount('2')).toBe(2);
    expect(parseShowCount(' 3 ')).toBe(3);
  });

  it('allows 0, which hides every item behind the button', () => {
    expect(parseShowCount('0')).toBe(0);
  });

  it('keeps only the whole-number part of a decimal', () => {
    expect(parseShowCount('2.5')).toBe(2);
  });

  it('falls back to 1 for negative or non-numeric values', () => {
    expect(parseShowCount('-1')).toBe(1);
    expect(parseShowCount('two')).toBe(1);
  });
});
