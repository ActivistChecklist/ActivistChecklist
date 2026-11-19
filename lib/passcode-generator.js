/**
 * Random phone passcodes for components/guides/PasscodeGenerator.jsx.
 *
 * A passcode that looks random but isn't is worse than none, because nobody
 * can tell by looking at one code. So digits only ever come from the
 * browser's CSPRNG, with no Math.random fallback, and every digit 0 to 9 is
 * equally likely.
 */

export const PASSCODE_LENGTHS = [6, 8, 10];
export const DEFAULT_PASSCODE_LENGTH = 8;

function fillFromCrypto(bytes) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('crypto.getRandomValues is not available');
  }
  return globalThis.crypto.getRandomValues(bytes);
}

/**
 * A string of `length` random decimal digits, leading zeros kept.
 *
 * Bytes run 0 to 255, so `byte % 10` alone would make 0 to 5 slightly more
 * likely than 6 to 9. Bytes of 250 and up are thrown away and drawn again.
 *
 * `fillRandom` fills a Uint8Array in place; tests pass their own.
 */
export function randomDigits(length, fillRandom = fillFromCrypto) {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(`Passcode length must be a positive whole number, got ${length}`);
  }
  let digits = '';
  // getRandomValues refuses more than 65,536 bytes per call
  const bytes = new Uint8Array(Math.min(length * 2, 1024));
  while (digits.length < length) {
    fillRandom(bytes);
    for (const byte of bytes) {
      if (byte >= 250) continue;
      digits += String(byte % 10);
      if (digits.length === length) break;
    }
  }
  return digits;
}

/**
 * Splits digits into chunks of 3 or 4 so they're easier to read and write
 * down, with the larger chunks last: 6 -> 3 3, 8 -> 4 4, 10 -> 3 3 4.
 */
export function groupDigits(digits) {
  const count = Math.ceil(digits.length / 4);
  const sizes = Array(count).fill(Math.floor(digits.length / count));
  for (let extra = digits.length % count, i = count - 1; extra > 0; extra--, i--) sizes[i]++;
  let start = 0;
  return sizes.map((size) => digits.slice(start, (start += size)));
}
