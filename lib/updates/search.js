/**
 * Search index for the /updates autocomplete.
 *
 * Each row in the index represents one (product, release) pair — i.e. a specific
 * device or OS-version the user might own. Ranking combines fuse.js relevance with
 * release-date recency.
 */

import Fuse from 'fuse.js';
import { platformGroupForFamily } from './snapshot';

const RELEVANCE_WEIGHT = 0.7;
const RECENCY_WEIGHT = 0.3;
const RECENCY_FALLOFF_YEARS = 10; // age at which recencyScore reaches 0

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Strip Windows release-label suffixes that don't make sense to a consumer:
 *   "11 24H2 (W)" → "11 24H2"
 */
function tidyReleaseLabel(productId, label) {
  if (productId === 'windows') {
    return label.replace(/\s*\((W|E)\)\s*/g, '').trim();
  }
  return label;
}

/** "Apple iPhone" + "12 Pro" → "iPhone 12 Pro" (drops the manufacturer prefix to keep it readable). */
function buildDisplayLabel(product, releaseLabel) {
  // Strip leading manufacturer/marketing word from product label so we don't get
  // "Apple iPhone 12 Pro" — "iPhone 12 Pro" is what users type.
  const tidy = tidyReleaseLabel(product.id, releaseLabel);

  // For OS products, the product label IS the answer ("Apple iOS"); use it directly.
  if (product.kind === 'os') {
    // Strip "Apple " / "Microsoft " / "Google " prefix.
    const productLabel = product.label.replace(/^(Apple |Microsoft |Google )/, '');
    return `${productLabel} ${tidy}`.trim();
  }

  // For devices, drop "Apple " etc. but keep the family ("MacBook Pro 14-inch (2024, M4)" already has it).
  // For phones/tablets/watches, the release label often DOESN'T include the family.
  // E.g. iPhone product → release "12 Pro" → we want "iPhone 12 Pro".
  // Mac product → release "MacBook Pro 14-inch (2024, M4)" already has "MacBook Pro".
  if (/^(MacBook|iMac|Mac\s+(mini|Pro|Studio))/i.test(tidy)) {
    return tidy;
  }
  // Otherwise prepend the product family name (strip leading manufacturer).
  const productLabel = product.label
    .replace(/^(Apple |Google |Samsung |Microsoft |Motorola |OnePlus |Nokia )/, '');
  return `${productLabel} ${tidy}`.trim();
}

/** Build searchable rows from the snapshot. */
export function buildSearchIndex(snapshot, { now = new Date() } = {}) {
  const rows = [];
  for (const product of snapshot.products) {
    for (const release of product.releases) {
      const displayLabel = buildDisplayLabel(product, release.label);
      const searchKeywords = [
        displayLabel,
        product.label,
        release.label,
        ...(product.aliases || []),
        product.family,
      ]
        .filter(Boolean)
        .join(' ');

      const ageYears = release.releaseDate
        ? (now - new Date(release.releaseDate)) / MS_PER_YEAR
        : null;
      const recencyScore = ageYears == null
        ? 0
        : Math.max(0, 1 - ageYears / RECENCY_FALLOFF_YEARS);

      rows.push({
        productId: product.id,
        releaseId: release.id,
        displayLabel,
        searchKeywords,
        family: product.family,
        platformGroup: platformGroupForFamily(product.family),
        formFactor: product.formFactor,
        kind: product.kind,
        releaseDate: release.releaseDate,
        recencyScore,
      });
    }
  }
  return rows;
}

/**
 * Build a fuse instance over the index. Tunable weights live here.
 */
export function buildFuse(rows) {
  return new Fuse(rows, {
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    keys: [
      { name: 'displayLabel', weight: 0.7 },
      { name: 'searchKeywords', weight: 0.3 },
    ],
  });
}

/**
 * Search the index, optionally with a "priority context" — a set of productIds that
 * should bubble to the top. Items outside the priority set are still returned (the user
 * can find anything by typing) but they're tagged `dimmed: true` so the UI can fade them.
 *
 * Behaviour:
 *   - Empty query + no priority → []  (we don't dump all 800+ rows by default)
 *   - Empty query + priority    → priority rows by recency, then non-priority rows by recency, dimmed
 *   - Query + no priority       → fuzzy match + recency boost
 *   - Query + priority          → priority matches first, non-priority matches dimmed below
 *     (an exact-name match in the non-priority set is NOT dimmed — we surface it normally
 *      so a user who types their device's full name always gets the right answer)
 */
export function searchIndex(rows, fuse, query, priorityProductIds, { limit = 8 } = {}) {
  const trimmed = (query || '').trim();
  const prioritySet = priorityProductIds && priorityProductIds.length
    ? new Set(priorityProductIds)
    : null;

  function inPriority(row) { return prioritySet ? prioritySet.has(row.productId) : false; }

  if (!trimmed) {
    if (!prioritySet) return [];
    const sorted = [...rows].sort((a, b) => b.recencyScore - a.recencyScore);
    const head = sorted.filter(inPriority).slice(0, limit);
    if (head.length >= limit) return head;
    const tail = sorted.filter((r) => !inPriority(r)).slice(0, limit - head.length)
      .map((r) => ({ ...r, dimmed: true }));
    return head.concat(tail);
  }

  const matches = fuse.search(trimmed, { limit: limit * 4 });
  const trimmedLower = trimmed.toLowerCase();

  const enriched = matches.map((m) => {
    const matchScore = 1 - (m.score ?? 1);
    const rank = matchScore * RELEVANCE_WEIGHT + m.item.recencyScore * RECENCY_WEIGHT;
    const inP = inPriority(m.item);
    // An exact-name match (case-insensitive) is never dimmed — it's almost always
    // the device the user is actually looking for, regardless of the priority context.
    const isExact = m.item.displayLabel.toLowerCase() === trimmedLower;
    return { item: m.item, rank, inPriority: inP, isExact };
  });

  // Order: priority matches first (by rank), then exact non-priority matches,
  // then dimmed non-priority matches.
  const head = enriched.filter((x) => x.inPriority).sort((a, b) => b.rank - a.rank);
  const exactTail = enriched.filter((x) => !x.inPriority && x.isExact).sort((a, b) => b.rank - a.rank);
  const dimmedTail = enriched.filter((x) => !x.inPriority && !x.isExact).sort((a, b) => b.rank - a.rank);

  if (!prioritySet) {
    return enriched.sort((a, b) => b.rank - a.rank).slice(0, limit).map((x) => x.item);
  }

  return head
    .concat(exactTail)
    .concat(dimmedTail.map((x) => ({ ...x, item: { ...x.item, dimmed: true } })))
    .slice(0, limit)
    .map((x) => x.item);
}
