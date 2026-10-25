/**
 * Checklist sections group every checklist, explainer, and printable under the
 * situation it belongs to ("Everyone should do these", "Protests & travel", ...). The
 * homepage, the Checklists menu, /checklists/, and each guide page all read the
 * same groups from `checklistSections` in config/navigation.json.
 *
 * These helpers work on plain keys so they can be tested without React icons.
 */

/** "/signal/" -> "signal" */
export function slugFromHref(href) {
  return String(href || '').replace(/^\/+|\/+$/g, '');
}

/**
 * The section a guide is listed in. A guide can appear in more than one
 * section's `items`; the first one wins, so order sections by priority.
 *
 * @param {{ key: string, items: string[] }[]} sections
 * @param {string} guideKey
 */
export function findSectionForGuide(sections, guideKey) {
  return sections.find((section) => section.items.includes(guideKey)) || null;
}

/**
 * The section that lists a page (an explainer, how-to, or printable) among its
 * `featured` or `reads`. Pages are matched by URL slug, because a navigation
 * item's key isn't always its slug ("police-door-poster" lives at /police/).
 * A section that features the page wins over one that only lists it in
 * `reads`, so the security party stays under Organizing.
 *
 * @param {{ key: string, featured: string[], reads: string[] }[]} sections
 * @param {Record<string, { href?: string }>} items - navigation.json `items`
 * @param {string} pageSlug - e.g. "vpn"
 */
export function findSectionForPage(sections, items, pageSlug) {
  const itemKey = Object.keys(items).find((key) => slugFromHref(items[key].href) === pageSlug);
  if (!itemKey) return null;
  return (
    sections.find((section) => section.featured.includes(itemKey)) ||
    sections.find((section) => section.reads.includes(itemKey)) ||
    null
  );
}

/**
 * Other checklists in the same section to suggest at the end of a guide:
 * featured ones first, then the rest, never the guide itself.
 *
 * @param {{ items: string[], featured: string[] }} section
 * @param {string} guideKey
 * @param {number} limit
 */
export function getNextInSection(section, guideKey, limit = 2) {
  if (!section) return [];
  const ordered = [
    ...section.featured.filter((key) => section.items.includes(key)),
    ...section.items,
  ];
  return [...new Set(ordered)].filter((key) => key !== guideKey).slice(0, limit);
}

/**
 * The explainer that answers "why" for a guide, from `pairsWith` on the
 * explainer's navigation item.
 *
 * @param {Record<string, { pairsWith?: string }>} items - navigation.json `items`
 * @param {string} guideKey
 * @returns {string | null} the explainer's item key
 */
export function findPairedExplainer(items, guideKey) {
  const match = Object.entries(items).find(([, item]) => item.pairsWith === guideKey);
  return match ? match[0] : null;
}

const WORDS_PER_MINUTE = 230;

/**
 * Rough reading time for an MDX body. JSX tags, link targets, and markdown
 * syntax are dropped first so a component-heavy page doesn't read as longer
 * than it is.
 */
export function readingMinutes(mdx) {
  const text = String(mdx || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/[#*_>`[\]{}|-]/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * True when a YYYY-MM-DD date is more than `months` months before `now`.
 * Missing or unparseable dates are not treated as stale.
 */
export function isOlderThanMonths(dateString, months, now = new Date()) {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return date < cutoff;
}
