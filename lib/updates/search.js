/**
 * Search index for the /updates autocomplete.
 *
 * Each row in the index represents one (product, release) pair — i.e. a specific
 * device or OS-version the user might own. Ranking combines fuse.js relevance with
 * release-date recency.
 */

import Fuse from 'fuse.js';
import { platformGroupForFamily } from './snapshot';

// Recency is a tiebreaker, not a primary signal — a precise text match should never
// be outranked by a newer-but-less-relevant item.
const RELEVANCE_WEIGHT = 1.0;
const RECENCY_WEIGHT = 0.05;
const RECENCY_FALLOFF_YEARS = 10; // age at which recencyScore reaches 0
const YEAR_TOKEN_RE = /\b(19|20)\d{2}\b/g;
const YEAR_BOOST_PER_YEAR_DELTA = 0.04;
const YEAR_BOOST_MAX = 0.35;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Per-product label normalisations for display.
 *   Windows: "11 24H2 (W)" → "11 24H2" (drop home/enterprise suffix that isn't
 *   user-facing).
 *   Android: "16 'Baklava'" → "16 (Baklava)" (the snapshot quotes the codename;
 *   the rest of the UI parenthesises it, so unify the format).
 */
function tidyReleaseLabel(productId, label) {
  if (typeof label !== 'string') return label;
  if (productId === 'windows') {
    return label.replace(/\s*\((W|E)\)\s*/g, '').trim();
  }
  if (productId === 'android') {
    return label.replace(/\s+'([^']+)'/, ' ($1)');
  }
  return label;
}

// Exported for tests so the formatting rules stay pinned (Android codename brackets,
// Windows edition suffix stripping, etc.).
export { tidyReleaseLabel };

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
 *
 * displayLabel is the primary key — the rendered label is what users type. searchKeywords
 * (product label + family + aliases) is a smaller boost so "samsung galaxy" matches even
 * though only "Galaxy A57" is in the displayLabel.
 */
export function buildFuse(rows) {
  return new Fuse(rows, {
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    keys: [
      { name: 'displayLabel', weight: 0.8 },
      { name: 'searchKeywords', weight: 0.2 },
    ],
  });
}

/**
 * If the query mentions a year (e.g. "macbook pro 2013"), reward items whose display
 * label contains a *close* year. Items with no year string in the label aren't penalised;
 * items with a far-off year (2024 vs 2013) lose the boost. This prevents recency from
 * outranking semantic year matches.
 */
function yearProximityBoost(query, displayLabel) {
  const queryYears = (query.match(YEAR_TOKEN_RE) || []).map(Number);
  if (queryYears.length === 0) return 0;
  const labelYears = (displayLabel.match(YEAR_TOKEN_RE) || []).map(Number);
  if (labelYears.length === 0) return 0;
  const target = queryYears[0];
  const closestDelta = Math.min(...labelYears.map((y) => Math.abs(y - target)));
  return Math.max(0, YEAR_BOOST_MAX - closestDelta * YEAR_BOOST_PER_YEAR_DELTA);
}

/**
 * Search the index, optionally with a "priority context" — a set of productIds that
 * should bubble to the top. Items outside the priority set are still returned at full
 * visibility (the user can find anything by typing), just ranked below priority matches.
 *
 * Behaviour:
 *   - Empty query + no priority → []  (we don't dump all 800+ rows by default)
 *   - Empty query + priority    → priority rows by recency, then non-priority rows by recency
 *   - Query + no priority       → relevance-first ranking + small recency tiebreaker
 *   - Query + priority          → priority matches first, then everything else by rank
 *
 * Result limit is generous (defaults to 200) so a broad query like "galaxy"
 * surfaces every Samsung phone rather than capping at a small number. Matches
 * the fuse candidate pool so we never silently drop ranked matches. The
 * dropdown is max-h-80 with overflow-y-auto so the long list scrolls in place
 * — the user can still get to the iPhone 6 without typing a more specific
 * query.
 */
export function searchIndex(rows, fuse, query, priorityProductIds, { limit = 200 } = {}) {
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

  // Pull a generous candidate pool from fuse so our re-ranking isn't pre-filtered.
  const matches = fuse.search(trimmed, { limit: 200 });

  const enriched = matches.map((m) => {
    const matchScore = 1 - (m.score ?? 1);
    const yearBoost = yearProximityBoost(trimmed, m.item.displayLabel);
    const rank =
      matchScore * RELEVANCE_WEIGHT +
      m.item.recencyScore * RECENCY_WEIGHT +
      yearBoost;
    return { item: m.item, rank, inPriority: inPriority(m.item) };
  });

  if (!prioritySet) {
    return enriched.sort((a, b) => b.rank - a.rank).slice(0, limit).map((x) => x.item);
  }

  const head = enriched.filter((x) => x.inPriority).sort((a, b) => b.rank - a.rank);
  const tail = enriched.filter((x) => !x.inPriority).sort((a, b) => b.rank - a.rank);
  return head.concat(tail).slice(0, limit).map((x) => x.item);
}
