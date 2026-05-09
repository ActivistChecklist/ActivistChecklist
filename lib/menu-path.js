/**
 * Pure helpers for the <MenuPath> MDX component.
 *
 * Authors write paths inline in MDX, e.g.:
 *   <MenuPath>*On iPhone:* Signal > Settings > **Notifications**</MenuPath>
 *
 * This module covers the parts that don't need React: detecting the platform
 * from the leading italic header, splitting a text run on " > " separators,
 * and picking the arrow glyph based on locale direction.
 */

export const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export const RIGHT_ARROW = '→'; // →
export const LEFT_ARROW = '←';  // ←

export function isRtlLocale(locale) {
  if (typeof locale !== 'string' || locale === '') return false;
  return RTL_LOCALES.has(locale.toLowerCase().split('-')[0]);
}

export function getArrow(rtl) {
  return rtl ? LEFT_ARROW : RIGHT_ARROW;
}

const PLATFORM_PATTERNS = [
  { key: 'iphone',  test: /^iphone\b/i },
  { key: 'mac',     test: /^(?:macos|mac\s*os|mac)\b/i },
  { key: 'android', test: /^android\b/i },
  { key: 'windows', test: /^windows\b/i },
];

const LEADING_ON_RE = /^on\s+/i;

/**
 * Parse a header label like "On iPhone" into a platform key and the label to
 * display. The leading "On " is stripped only when the trailing word matches a
 * known platform — so "On call" or "On site" pass through untouched.
 *
 * Returns null if the label is empty/non-string.
 */
export function parsePlatformHeader(label) {
  if (typeof label !== 'string') return null;
  const trimmed = label.trim();
  if (!trimmed) return null;

  const withoutOn = trimmed.replace(LEADING_ON_RE, '');
  const match = PLATFORM_PATTERNS.find((p) => p.test.test(withoutOn));

  if (match) return { key: match.key, displayLabel: withoutOn };
  return { key: null, displayLabel: trimmed };
}

/** Convenience accessor for callers that only care about the platform key. */
export function detectPlatformKey(label) {
  return parsePlatformHeader(label)?.key ?? null;
}

/**
 * Split a text run on whitespace-flanked step separators — either ">" (the
 * authoring convention) or a literal "→" (already-converted source). Either
 * way, the caller renders the locale-correct arrow between segments, so RTL
 * still flips even if the source has hard-coded "→".
 */
export function splitOnChevron(text) {
  if (typeof text !== 'string') return [text];
  return text.split(/\s+(?:>|→)\s+/);
}
