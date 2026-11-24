import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OPTIONS,
  DEFAULT_WORD_COUNT,
  SYMBOLS,
  WEAK_BITS,
  WORD_COUNTS,
  drawPassphrase,
  formatWords,
  joinWords,
  passphraseBits,
  randomBelow,
} from '../lib/passphrase-generator';
import SHORT_WORDS from '../lib/wordlists/orchard-street-alpha';
import LONG_WORDS from '../lib/wordlists/orchard-street-long';

// Fills each call's Uint32Array with the next value from the list.
function scriptedFill(...values) {
  let call = 0;
  return (array) => {
    array.fill(values[Math.min(call++, values.length - 1)]);
    return array;
  };
}

describe('word lists', () => {
  it.each([
    ['short', SHORT_WORDS, 1296],
    ['long', LONG_WORDS, 17576],
  ])('the %s list has its full size, lowercase words only and no repeats', (_, words, size) => {
    expect(words).toHaveLength(size);
    expect(new Set(words).size).toBe(size);
    for (const word of words) expect(word).toMatch(/^[a-z]+$/);
  });
});

describe('randomBelow', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps values below the last whole multiple of n with % n', () => {
    expect(randomBelow(1296, scriptedFill(1297))).toBe(1);
    expect(randomBelow(10, scriptedFill(0))).toBe(0);
  });

  it('throws away values at or above the last whole multiple of n and draws again', () => {
    // 2^32 % 1296 is 1264, so values from 2^32 - 1264 up are rejected
    const limit = 2 ** 32 - 1264;
    expect(randomBelow(1296, scriptedFill(limit, 2 ** 32 - 1, 5))).toBe(5);
    expect(randomBelow(1296, scriptedFill(limit - 1))).toBe(1295);
  });

  it('spreads results evenly', () => {
    const counts = Array(6).fill(0);
    const draws = 60_000;
    for (let i = 0; i < draws; i++) counts[randomBelow(6)]++;
    const expected = draws / 6;
    const chiSquare = counts.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
    // 5 degrees of freedom: a fair source goes over 40 far less than once in a million runs
    expect(chiSquare).toBeLessThan(40);
  });

  it('throws instead of falling back when the browser has no crypto', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => randomBelow(10)).toThrow(/getRandomValues/);
  });

  it('rejects ranges that are not whole numbers from 1 to 2^32', () => {
    for (const bad of [0, -1, 2.5, NaN, 2 ** 32 + 1, '10']) {
      expect(() => randomBelow(bad)).toThrow(RangeError);
    }
  });
});

describe('drawPassphrase', () => {
  it('draws the requested number of words from the list', () => {
    for (const count of WORD_COUNTS) {
      const draw = drawPassphrase(SHORT_WORDS, count);
      expect(draw.words).toHaveLength(count);
      for (const word of draw.words) expect(SHORT_WORDS).toContain(word);
    }
    expect(WORD_COUNTS).toContain(DEFAULT_WORD_COUNT);
  });

  it('places the digit and symbol after a word that exists', () => {
    const draw = drawPassphrase(['a', 'b', 'c'], 4, scriptedFill(2, 1, 7, 3, 9, 3));
    expect(draw.words).toEqual(['c', 'b', 'b', 'a']);
    expect(draw).toMatchObject({ digit: '9', digitAfter: 3, symbol: SYMBOLS[3], symbolAfter: 3 });
  });

  it('rejects an empty list or a bad word count', () => {
    expect(() => drawPassphrase([], 5)).toThrow(RangeError);
    for (const bad of [0, -1, 2.5]) {
      expect(() => drawPassphrase(SHORT_WORDS, bad)).toThrow(RangeError);
    }
  });
});

describe('formatWords and joinWords', () => {
  const draw = {
    words: ['pine', 'egg', 'zen'],
    digit: '4',
    digitAfter: 1,
    symbol: '#',
    symbolAfter: 1,
  };

  it('leaves the words alone with the default options', () => {
    expect(joinWords(formatWords(draw, DEFAULT_OPTIONS), 'space')).toBe('pine egg zen');
  });

  it('capitalizes and adds the number and symbol after their word', () => {
    const words = formatWords(draw, { capitalize: true, addNumber: true, addSymbol: true });
    expect(words).toEqual(['Pine', 'Egg4#', 'Zen']);
  });

  it('joins with each separator, and with nothing', () => {
    const words = formatWords(draw, DEFAULT_OPTIONS);
    expect(joinWords(words, 'hyphen')).toBe('pine-egg-zen');
    expect(joinWords(words, 'period')).toBe('pine.egg.zen');
    expect(joinWords(words, 'none')).toBe('pineeggzen');
  });

  it("doesn't change the draw it was given", () => {
    formatWords(draw, { capitalize: true, addNumber: true, addSymbol: true });
    expect(draw.words).toEqual(['pine', 'egg', 'zen']);
  });
});

describe('passphraseBits', () => {
  it('counts log2(list size) per word, rounded down', () => {
    expect(passphraseBits(17576, 5, DEFAULT_OPTIONS)).toBe(70);
    expect(passphraseBits(1296, 7, DEFAULT_OPTIONS)).toBe(72);
  });

  it('adds the choice of digit or symbol and the word it follows', () => {
    // 7 words: log2(1296) * 7 + log2(10 * 7) + log2(10 * 7)
    expect(passphraseBits(1296, 7, { addNumber: true, addSymbol: true })).toBe(84);
  });

  it('warns on 5 short-list words but not 6', () => {
    expect(passphraseBits(1296, 5, DEFAULT_OPTIONS)).toBeLessThan(WEAK_BITS);
    expect(passphraseBits(1296, 6, DEFAULT_OPTIONS)).toBeGreaterThanOrEqual(WEAK_BITS);
  });
});
