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

/**
 * Per-product display short names for cases where stripping the manufacturer prefix
 * from product.label leaves something nonsensical (e.g. "Apple Watch" → "Watch").
 * If a product isn't here, we strip the manufacturer prefix generically.
 */
const PRODUCT_SHORT_LABEL = {
  'apple-watch': 'Apple Watch',
  'samsung-mobile': 'Galaxy',
  'motorola-mobility': 'Motorola',
  'oneplus': 'OnePlus',
  'nokia': 'Nokia',
};

const MANUFACTURER_PREFIX = /^(Apple|Google|Samsung|Microsoft|Motorola|OnePlus|Nokia) /;

function shortLabelFor(product) {
  return PRODUCT_SHORT_LABEL[product.id] || product.label.replace(MANUFACTURER_PREFIX, '');
}

/**
 * Build a clean display label. If the release label already starts with the product's
 * short name (e.g. iPad's "iPad (A16)", Pixel's "Pixel 10", MacBook Pro's "MacBook Pro
 * 14-inch (2024, M4)"), use it as-is. Otherwise prepend the short name.
 */
export function buildDisplayLabel(product, release) {
  const releaseLabel = typeof release === 'string' ? release : release.label;
  const tidy = tidyReleaseLabel(product.id, releaseLabel);
  const shortName = shortLabelFor(product);
  if (!shortName) return tidy;
  if (tidy.toLowerCase().startsWith(shortName.toLowerCase())) {
    return tidy;
  }
  return `${shortName} ${tidy}`.trim();
}

/** Build searchable rows from the snapshot. */
export function buildSearchIndex(snapshot, { now = new Date() } = {}) {
  const rows = [];
  for (const product of snapshot.products) {
    for (const release of product.releases) {
      const displayLabel = buildDisplayLabel(product, release);
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
 * should bubble to the top. Items outside the priority set are still returned at full
 * visibility (the user can find anything by typing), just ranked below priority matches.
 *
 * Behaviour:
 *   - Empty query + no priority → []  (we don't dump all 800+ rows by default)
 *   - Empty query + priority    → priority rows by recency, then non-priority rows by recency
 *   - Query + no priority       → fuzzy match + recency boost
 *   - Query + priority          → priority matches first, then everything else by rank
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
    const tail = sorted.filter((r) => !inPriority(r)).slice(0, limit - head.length);
    return head.concat(tail);
  }

  const matches = fuse.search(trimmed, { limit: limit * 4 });

  const enriched = matches.map((m) => {
    const matchScore = 1 - (m.score ?? 1);
    const rank = matchScore * RELEVANCE_WEIGHT + m.item.recencyScore * RECENCY_WEIGHT;
    return { item: m.item, rank, inPriority: inPriority(m.item) };
  });

  if (!prioritySet) {
    return enriched.sort((a, b) => b.rank - a.rank).slice(0, limit).map((x) => x.item);
  }

  // Priority matches first (by rank), then everything else (by rank). No dimming.
  const head = enriched.filter((x) => x.inPriority).sort((a, b) => b.rank - a.rank);
  const tail = enriched.filter((x) => !x.inPriority).sort((a, b) => b.rank - a.rank);
  return head.concat(tail).slice(0, limit).map((x) => x.item);
}
