import { DEFAULT_LOCALE, LOCALES } from './i18n-config.mjs';

/**
 * Helpers for the site search dialog (components/Search.js). The index is
 * Pagefind, built from the static export by scripts/build-search-index.sh.
 */

/**
 * Checklist item headings only get their real id (the item slug) after
 * hydration, so the browser can't jump to a deep link before the items above
 * it restore their expanded state (see ChecklistItem). The static HTML that
 * Pagefind indexes carries this prefixed id instead, which gives search one
 * anchor per item without the early jump. toSiteUrl maps it back to the slug.
 */
export const CHECKLIST_ITEM_ANCHOR_PREFIX = 'checklist-item-';

/** @param {string} slug */
export function checklistItemAnchorId(slug) {
  return `${CHECKLIST_ITEM_ANCHOR_PREFIX}${slug}`;
}

const DEFAULT_LOCALE_PREFIX = new RegExp(`^/${DEFAULT_LOCALE}(?=[/#]|$)`);
const LOCALE_PREFIX = new RegExp(`^/(?:${Object.keys(LOCALES).join('|')})(?=[/#]|$)`);

/**
 * Pagefind URL -> the URL to link to. English pages are exported under /en/
 * but served without a prefix, so linking /en/vpn/ as indexed costs a redirect.
 * @param {string} url
 */
export function toSiteUrl(url) {
  if (typeof url !== 'string') return url;
  let siteUrl = url.replace(DEFAULT_LOCALE_PREFIX, '');
  if (!siteUrl.startsWith('/')) siteUrl = `/${siteUrl}`;
  return siteUrl.replace(`#${CHECKLIST_ITEM_ANCHOR_PREFIX}`, '#');
}

/**
 * Pages that match many queries but are rarely what the searcher wants: the
 * news feed names every app and company in passing, and the glossary is
 * one-line definitions. Their score is scaled down so the guide that covers
 * the topic ranks first.
 *
 * Tuned 2026-10-28 against the most common real queries: "iphone", "ice" and
 * "ai" put /news/ first, "password manager" and "phishing" put /glossary/
 * first. Revisit if either page stops being a long list.
 */
const SCORE_FACTORS = {
  '/news/': 0.35,
  '/glossary/': 0.5,
};

/** Path without locale prefix or hash, for matching SCORE_FACTORS. */
function pagePath(url) {
  return url.replace(LOCALE_PREFIX, '').split('#')[0] || '/';
}

/**
 * Re-rank pages by Pagefind score after SCORE_FACTORS. Stable for ties.
 * @template {{ url: string, score: number }} T
 * @param {T[]} pages
 * @returns {T[]}
 */
export function rankPages(pages) {
  return pages
    .map((page, index) => ({
      page,
      index,
      score: page.score * (SCORE_FACTORS[pagePath(page.url)] ?? 1),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ page }) => page);
}

/** Sum of a sub result's hit scores, where a hit in a heading counts for more. */
function sectionScore(sub) {
  return (sub.weighted_locations ?? []).reduce((sum, hit) => sum + hit.balanced_score, 0);
}

/**
 * Shape one Pagefind result's data() for the dialog.
 *
 * Pagefind returns sub results in page order, so an item that mentions a word
 * once can sit above the item about it ("password manager" on /essentials/).
 * They are re-sorted by score before the cap. The sub result with no anchor is
 * dropped: it is the page itself, which the page row already links to.
 * @param {object} data - from `result.data()`
 * @param {number} score - from the Pagefind result
 * @param {number} maxSections
 */
export function toPageResult(data, score, maxSections) {
  return {
    url: toSiteUrl(data.url),
    title: data.meta?.title ?? '',
    excerpt: data.excerpt,
    score,
    sections: (data.sub_results ?? [])
      .filter((sub) => sub.anchor)
      .map((sub, index) => ({ sub, index, score: sectionScore(sub) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxSections)
      .map(({ sub }) => ({ url: toSiteUrl(sub.url), title: sub.title, excerpt: sub.excerpt })),
  };
}

const WORD = /[\p{L}\p{N}]+/gu;

/**
 * Split `text` into runs, marking each word that starts with a query term
 * ("vpn" marks "VPNs"). Returned as data so callers render <mark> without
 * building HTML from the query.
 * @param {string} text
 * @param {string} query
 * @returns {{ text: string, match: boolean }[]}
 */
export function highlightParts(text, query) {
  const terms = query.toLowerCase().match(WORD) ?? [];
  if (!text || terms.length === 0) return [{ text: text ?? '', match: false }];

  const parts = [];
  let last = 0;
  for (const { 0: word, index } of text.matchAll(WORD)) {
    const lower = word.toLowerCase();
    if (!terms.some((term) => lower.startsWith(term))) continue;
    if (index > last) parts.push({ text: text.slice(last, index), match: false });
    parts.push({ text: word, match: true });
    last = index + word.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_LIKE = /\+?\d[\d\s().-]{5,}\d/g;
const MAX_TRACKED_QUERY_LENGTH = 100;

/**
 * The query as sent to analytics. People sometimes paste an email address or
 * phone number into a search box; those never leave the browser.
 * @param {string} query
 */
export function scrubQueryForAnalytics(query) {
  return query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(EMAIL, '[email]')
    .replace(PHONE_LIKE, (match) => (match.replace(/\D/g, '').length >= 7 ? '[phone]' : match))
    .slice(0, MAX_TRACKED_QUERY_LENGTH);
}
