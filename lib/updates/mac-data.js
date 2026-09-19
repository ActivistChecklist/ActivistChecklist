/**
 * Helpers for the Mac-data pipeline that combines the upstream SOFA macOS feed
 * with our committed `data/legacy-mac-models.json` (Macs no longer in SOFA but
 * still in users' hands) and `data/sofa-watchlist.json` (SOFA identifiers we're
 * deliberately tracking, used to detect when SOFA quietly drops a model).
 *
 * Pure functions only — file I/O lives in the calling scripts so this module
 * stays test-friendly.
 */

const VIRTUAL_MAC_PREFIXES = ['VirtualMac', 'VMM-'];

/**
 * True when an identifier belongs to a virtual-machine pseudo-model that we
 * deliberately ignore in the watchlist (those aren't user-facing devices).
 */
export function isVirtualMacIdentifier(id) {
  return VIRTUAL_MAC_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * Strip the documentation pseudo-keys ("_README", etc.) before iterating model
 * entries. Anything starting with an underscore is treated as metadata.
 */
export function stripDocKeys(map) {
  if (!map || typeof map !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Compare current SOFA model identifiers against the watchlist, returning two
 * lists: `dropped` (watchlist entries SOFA no longer publishes — needs human
 * action) and `novel` (SOFA entries not yet in the watchlist — informational
 * unless we want drop-detection on them).
 *
 * Identifiers we treat as virtual-machine (VirtualMac*, VMM-*) are filtered
 * out of `novel` since they don't represent real hardware.
 */
export function diffSofaWatchlist(sofaIdentifiers, watchlistIdentifiers) {
  const sofaSet = new Set(sofaIdentifiers);
  const watchSet = new Set(watchlistIdentifiers);
  const dropped = [...watchSet].filter((id) => !sofaSet.has(id)).sort();
  const novel = [...sofaSet]
    .filter((id) => !watchSet.has(id))
    .filter((id) => !isVirtualMacIdentifier(id))
    .sort();
  return { dropped, novel };
}

/**
 * Merge legacy models into the SOFA models map. SOFA wins on identifier
 * collisions — when an upstream entry returns we want it to take precedence
 * over the hand-curated fallback. Doc pseudo-keys are stripped from both.
 */
export function mergeLegacyAndSofa(legacyModels, sofaModels) {
  return { ...stripDocKeys(legacyModels), ...stripDocKeys(sofaModels) };
}
