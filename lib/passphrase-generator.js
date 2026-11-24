/**
 * Random passphrases for components/guides/PassphraseGenerator.jsx.
 *
 * Same rule as lib/passcode-generator.js: a passphrase that looks random but
 * isn't is worse than none, because nobody can tell by looking at one. So
 * every random choice comes from the browser's CSPRNG, with no Math.random
 * fallback, and every word in the list is equally likely.
 */

export const WORD_COUNTS = [5, 6, 7, 8];
export const DEFAULT_WORD_COUNT = 7;

// Below this many bits the generator shows the "easier to crack" warning.
// 5 words from the short list (about 51 bits) get it, 6 (about 62) don't.
export const WEAK_BITS = 60;

// The strength meter is full at this many bits.
export const FULL_METER_BITS = 90;

// Bits of randomness per letter typed, for each list: log2(list size) divided
// by the average word length, to one decimal place. Short words give more
// randomness for each letter. __tests__/passphrase-generator.test.js
// recomputes these from the lists.
export const LIST_BITS_PER_LETTER = { short: 2.5, long: 1.8 };

export const SEPARATORS = { space: ' ', hyphen: '-', period: '.', none: '' };

// Symbols that sites with a "needs a symbol" rule almost always accept.
export const SYMBOLS = '!#$%&*+=?@';

export const DEFAULT_OPTIONS = {
  list: 'short',
  separator: 'space',
  capitalize: false,
  addNumber: false,
  addSymbol: false,
};

function fillFromCrypto(values) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('crypto.getRandomValues is not available');
  }
  return globalThis.crypto.getRandomValues(values);
}

/**
 * A random whole number from 0 to n - 1, each equally likely.
 *
 * Values run 0 to 2^32 - 1, so `value % n` alone would make the low results
 * slightly more likely whenever n doesn't divide 2^32 (1,296 and 17,576 don't).
 * Values at or above the last whole multiple of n are thrown away and drawn
 * again.
 *
 * `fillRandom` fills a Uint32Array in place; tests pass their own.
 */
export function randomBelow(n, fillRandom = fillFromCrypto) {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) {
    throw new RangeError(`Range must be a whole number from 1 to 2^32, got ${n}`);
  }
  const limit = 2 ** 32 - (2 ** 32 % n);
  const value = new Uint32Array(1);
  for (;;) {
    fillRandom(value);
    if (value[0] < limit) return value[0] % n;
  }
}

/**
 * Everything random about one passphrase: the words, plus a digit and a
 * symbol and which word each one goes after. The digit and symbol are drawn
 * every time, so turning "Add a number" on or off changes how the passphrase
 * is written out, not which words it has.
 */
export function drawPassphrase(wordlist, count, fillRandom = fillFromCrypto) {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`Word count must be a positive whole number, got ${count}`);
  }
  if (!wordlist?.length) throw new RangeError('Word list is empty');
  const pick = (n) => randomBelow(n, fillRandom);
  return {
    words: Array.from({ length: count }, () => wordlist[pick(wordlist.length)]),
    digit: String(pick(10)),
    digitAfter: pick(count),
    symbol: SYMBOLS[pick(SYMBOLS.length)],
    symbolAfter: pick(count),
  };
}

/** The words as the reader will type them, with the chosen options applied. */
export function formatWords(draw, { capitalize, addNumber, addSymbol }) {
  return draw.words.map((word, i) => {
    let out = capitalize ? word[0].toUpperCase() + word.slice(1) : word;
    if (addNumber && i === draw.digitAfter) out += draw.digit;
    if (addSymbol && i === draw.symbolAfter) out += draw.symbol;
    return out;
  });
}

export function joinWords(words, separator) {
  return words.join(SEPARATORS[separator] ?? SEPARATORS.space);
}

/**
 * How many bits of entropy the passphrase has, rounded down. Separators and
 * capital letters add none, since they're the same for every passphrase made
 * with the same options. A number adds a choice of 10 digits times which word
 * it follows, and a symbol the same with SYMBOLS.
 */
export function passphraseBits(listSize, count, { addNumber, addSymbol }) {
  let bits = count * Math.log2(listSize);
  if (addNumber) bits += Math.log2(10 * count);
  if (addSymbol) bits += Math.log2(SYMBOLS.length * count);
  return Math.floor(bits);
}
