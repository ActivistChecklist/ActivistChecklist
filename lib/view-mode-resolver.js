/**
 * Pure helpers for the checklist view-mode feature.
 * Kept separate from the React context so they can be imported by tests
 * without pulling in JSX.
 */

export const VIEW_MODES = {
  DETAILED: 'detailed',
  COMPACT: 'compact',
};

const VALID_MODES = new Set([VIEW_MODES.DETAILED, VIEW_MODES.COMPACT]);
const STORAGE_PREFIX = 'checklist-view:';

export function storageKeyForGuide(guideSlug) {
  return `${STORAGE_PREFIX}${guideSlug}`;
}

/**
 * Resolve initial view mode: URL > localStorage > 'detailed'.
 */
export function resolveViewMode(urlParam, storedValue) {
  if (urlParam && VALID_MODES.has(urlParam)) return urlParam;
  if (storedValue && VALID_MODES.has(storedValue)) return storedValue;
  return VIEW_MODES.DETAILED;
}

export function isValidViewMode(value) {
  return VALID_MODES.has(value);
}
