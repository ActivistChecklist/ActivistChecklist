/**
 * No-match heuristics for the device search box: when our snapshot can't resolve a
 * query, we still want to point the user somewhere useful. Right now that means
 * recognising common Windows-laptop brands so we can swap the generic empty-state
 * for a Windows-specific explanation (manufacturers don't announce EOL — check
 * `winver` instead).
 */

// Whole-word brand + product-line patterns. Whole-word so "thinkpad" hits but
// "thinker" doesn't, and "hp" doesn't false-match "shopping". Kept lowercase since
// the matcher lowercases the query before testing.
const WINDOWS_LAPTOP_BRAND_PATTERNS = [
  /\bdell\b/, /\bhp\b/, /\bhewlett[\s-]?packard\b/,
  /\blenovo\b/, /\bthinkpad\b/, /\bideapad\b/, /\byoga\b/, /\blegion\b/,
  /\bacer\b/, /\baspire\b/, /\bswift\b/, /\bnitro\b/, /\bpredator\b/,
  /\basus\b/, /\bzenbook\b/, /\bvivobook\b/, /\brog\b/,
  /\bmsi\b/,
  /\brazer\b/, /\bblade\b/,
  /\bsurface\b/,
  /\bsamsung\s+(galaxy\s+)?book\b/,
  /\bframework\b/,
  /\btoshiba\b/, /\bdynabook\b/,
  /\bfujitsu\b/, /\blifebook\b/,
  /\balienware\b/,
  /\bgateway\b/,
  /\blg\s+gram\b/,
];

/**
 * True if the no-match query looks like a Windows-laptop brand or product line.
 * Returns false for empty/null inputs and for queries that only match Apple,
 * Google, or Samsung phone product lines (handled by the snapshot directly).
 */
export function looksLikeWindowsLaptopQuery(query) {
  if (!query || typeof query !== 'string') return false;
  const lower = query.toLowerCase();
  return WINDOWS_LAPTOP_BRAND_PATTERNS.some((re) => re.test(lower));
}
