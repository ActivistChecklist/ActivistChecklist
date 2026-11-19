import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PASSCODE_LENGTH,
  PASSCODE_LENGTHS,
  groupDigits,
  randomDigits,
} from '../lib/passcode-generator';

// Fills every call's buffer from a list of byte values, one call per entry.
function scriptedFill(...calls) {
  let call = 0;
  return (bytes) => {
    const values = calls[Math.min(call++, calls.length - 1)];
    for (let i = 0; i < bytes.length; i++) bytes[i] = values[i % values.length];
    return bytes;
  };
}

describe('randomDigits', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns exactly the requested number of digits for each offered length', () => {
    for (const length of PASSCODE_LENGTHS) {
      expect(randomDigits(length)).toMatch(new RegExp(`^\\d{${length}}$`));
    }
    expect(PASSCODE_LENGTHS).toContain(DEFAULT_PASSCODE_LENGTH);
  });

  it('keeps leading zeros (the code is a string, never a number)', () => {
    expect(randomDigits(8, scriptedFill([0]))).toBe('00000000');
    expect(randomDigits(6, scriptedFill([10, 3]))).toBe('030303');
  });

  it('maps bytes 0 to 249 onto digits with % 10', () => {
    expect(randomDigits(4, scriptedFill([9, 19, 249, 240]))).toBe('9990');
  });

  it('throws away bytes 250 to 255 and draws again', () => {
    // Every byte of the first draw is rejected, so all digits come from the second
    const fill = scriptedFill([250, 251, 252, 253, 254, 255], [7]);
    expect(randomDigits(8, fill)).toBe('77777777');
    // Rejected bytes mixed in are skipped, not turned into digits
    expect(randomDigits(4, scriptedFill([255, 1, 250, 2]))).toBe('1212');
  });

  it('works for lengths too long for a single getRandomValues call', () => {
    expect(randomDigits(100_000)).toMatch(/^\d{100000}$/);
  });

  it('spreads digits evenly across 0 to 9', () => {
    const counts = Array(10).fill(0);
    const codes = 20_000;
    for (let i = 0; i < codes; i++) {
      for (const digit of randomDigits(10)) counts[digit]++;
    }
    const expected = (codes * 10) / 10;
    const chiSquare = counts.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
    // 9 degrees of freedom: a fair source goes over 50 far less than once in a million runs
    expect(chiSquare).toBeLessThan(50);
  });

  it('throws instead of falling back when the browser has no crypto', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => randomDigits(8)).toThrow(/getRandomValues/);
  });

  it('rejects lengths that are not positive whole numbers', () => {
    for (const bad of [0, -1, 2.5, NaN, '8']) {
      expect(() => randomDigits(bad)).toThrow(RangeError);
    }
  });
});

describe('groupDigits', () => {
  it('splits each offered length into chunks of 3 or 4, larger chunks last', () => {
    expect(groupDigits('123456')).toEqual(['123', '456']);
    expect(groupDigits('12345678')).toEqual(['1234', '5678']);
    expect(groupDigits('0123456789')).toEqual(['012', '345', '6789']);
  });

  it('keeps every digit, zeros included, in order', () => {
    expect(groupDigits('00000000').join('')).toBe('00000000');
    expect(groupDigits('9').join('')).toBe('9');
  });
});
