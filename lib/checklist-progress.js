/**
 * Progress for one guide section.
 *
 * `itemSlugs` are the checkable items in the section (informational items are
 * left out by the caller). The same slug listed twice counts once, because it
 * shares one localStorage key and so one checked state.
 *
 * Returns null when the section has nothing to check, so callers can skip
 * rendering a progress bar entirely.
 */
export function computeSectionProgress(itemSlugs, checkedBySlug) {
  const unique = [...new Set(itemSlugs ?? [])];
  const total = unique.length;
  if (total === 0) return null;

  const done = unique.filter((slug) => checkedBySlug?.[slug] === true).length;
  return { done, total, complete: done === total };
}
