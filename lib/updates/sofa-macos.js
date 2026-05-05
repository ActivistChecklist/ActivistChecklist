/**
 * Derive a Mac-products array from the SOFA macOS data feed
 * (https://sofafeed.macadmins.io/v2/macos_data_feed.json).
 *
 * SOFA's `Models` map covers every Mac model identifier Apple's macOS knows about
 * along with the marketing name and the macOS majors it can boot. We use this in
 * place of the hand-curated mac-compatibility.json so the per-Mac max-macOS data
 * stays current without yearly review (Apple silently drops some Macs each time
 * they ship a new macOS major; SOFA reflects that within days).
 *
 * What we get from SOFA: model identifier, marketing name, supported macOS majors.
 * What we DON'T get: hardware release dates. We parse a best-effort year/month out
 * of the marketing name (`Late 2014`, `Nov 2023`, plain `2020`) since that's the
 * convention Apple uses; models with no year in the name are skipped (typically
 * announced-but-unreleased entries that shouldn't appear in our autocomplete).
 *
 * All exports here are pure: they take JSON in and produce JSON out, no I/O. The
 * fetch script wraps these.
 */

// Order matters: longer prefixes first so "iMac Pro" beats "iMac", "MacBook Pro"
// beats "MacBook Air" beats the generic "MacBook " prefix used for the 12-inch line.
const PRODUCT_LINES = [
  {
    prefix: 'MacBook Pro',
    productId: 'macbook-pro',
    label: 'Apple MacBook Pro',
    formFactor: 'laptop',
    endoflifeUrl: 'https://support.apple.com/en-us/HT201624',
  },
  {
    prefix: 'MacBook Air',
    productId: 'macbook-air',
    label: 'Apple MacBook Air',
    formFactor: 'laptop',
    endoflifeUrl: 'https://support.apple.com/en-us/HT201862',
  },
  {
    prefix: 'iMac Pro',
    productId: 'imac-pro',
    label: 'Apple iMac Pro',
    formFactor: 'desktop',
    endoflifeUrl: 'https://support.apple.com/en-us/HT207483',
  },
  {
    prefix: 'iMac',
    productId: 'imac',
    label: 'Apple iMac',
    formFactor: 'desktop',
    endoflifeUrl: 'https://support.apple.com/en-us/HT201634',
  },
  {
    prefix: 'Mac mini',
    productId: 'mac-mini',
    label: 'Apple Mac mini',
    formFactor: 'desktop',
    endoflifeUrl: 'https://support.apple.com/en-us/HT201894',
  },
  {
    prefix: 'Mac Pro',
    productId: 'mac-pro',
    label: 'Apple Mac Pro',
    formFactor: 'desktop',
    endoflifeUrl: 'https://support.apple.com/en-us/HT202888',
  },
  {
    prefix: 'Mac Studio',
    productId: 'mac-studio',
    label: 'Apple Mac Studio',
    formFactor: 'desktop',
    endoflifeUrl: 'https://support.apple.com/en-us/HT213073',
  },
  // Generic "MacBook " (with trailing space) catches the 12-inch retina line; must
  // come AFTER the more-specific MacBook Pro / MacBook Air entries above.
  {
    prefix: 'MacBook ',
    productId: 'macbook',
    label: 'Apple MacBook',
    formFactor: 'laptop',
    endoflifeUrl: 'https://support.apple.com/en-us/HT201608',
  },
];

const MONTH_NAMES = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// Apple's "season" labels (Early/Mid/Late) map to rough mid-quarter months.
// These are deliberately approximate — for the age heuristic we only need year
// accuracy, but anchoring to a real month keeps the data shape consistent.
const SEASON_MONTHS = { Early: 3, Mid: 6, Late: 10 };

/**
 * Pick the matching product-line config for a marketing name. Returns null if the
 * name doesn't start with any recognised prefix (e.g. "Apple Virtual Machine",
 * "Virtual Machine (x86_64)", "MacBook Neo" — which only matches the generic
 * "MacBook " prefix when followed by a space; "MacBook Neo" lacks the comma /
 * paren that real Mac names use, but we let it through here and rely on the
 * release-date filter to drop it as undated).
 */
export function inferMacProductLine(marketingName) {
  if (typeof marketingName !== 'string') return null;
  return PRODUCT_LINES.find((line) => marketingName.startsWith(line.prefix)) || null;
}

/**
 * Best-effort release-date extraction from a SOFA marketing name. Returns an
 * ISO date string (YYYY-MM-DD) or null when no year is present.
 *
 * Patterns handled:
 *   "(... Nov 2023)"     → 2023-11-01
 *   "(... Late 2014)"    → 2014-10-01
 *   "(... Early 2015)"   → 2015-03-01
 *   "(... 2020)"         → 2020-01-01
 *   "(M1 Max)"           → null (no year, treat as undated)
 */
export function parseReleaseDateFromMarketingName(marketingName) {
  if (typeof marketingName !== 'string') return null;

  const monthMatch = marketingName.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/);
  if (monthMatch) {
    const month = MONTH_NAMES[monthMatch[1]];
    return formatIsoDate(Number(monthMatch[2]), month, 1);
  }

  const seasonMatch = marketingName.match(/\b(Early|Mid|Late)\s+(\d{4})\b/);
  if (seasonMatch) {
    const month = SEASON_MONTHS[seasonMatch[1]];
    return formatIsoDate(Number(seasonMatch[2]), month, 1);
  }

  // Plain year: prefer 20xx so we don't accidentally pick up something like a
  // 4-digit model number (none in the current SOFA data, but cheap to be strict).
  const yearMatch = marketingName.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    return formatIsoDate(Number(yearMatch[1]), 1, 1);
  }

  return null;
}

function formatIsoDate(year, month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Convert SOFA's "Mac15,3" style identifier into a slug suitable for our release
 * IDs and URL params: lowercase alphanumeric, with non-alphanumerics collapsed
 * to dashes. "Mac15,3" → "mac15-3".
 */
export function modelIdentifierToSlug(identifier) {
  if (typeof identifier !== 'string') return null;
  const slug = identifier.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : null;
}

/**
 * Build a full Mac products array from SOFA's `Models` map. Each product groups
 * the releases for one product line (MacBook Pro, iMac, etc); each release is a
 * single Mac model with its slug ID, marketing-name label, parsed release date,
 * and supportedOsRange equal to its highest-supported macOS major.
 *
 * Models that don't match any product line OR that have no parseable year are
 * skipped — those are usually pre-release identifiers ("MacBook Neo") or VM
 * placeholders ("Apple Virtual Machine", "Virtual Machine (x86_64)") that
 * shouldn't appear in our autocomplete.
 *
 * Empty product lines (no surviving releases) are pruned.
 *
 * Releases inside each product are sorted newest-first so the autocomplete
 * surfaces current models above legacy ones.
 */
export function deriveMacProductsFromSofa(sofaModels) {
  if (!sofaModels || typeof sofaModels !== 'object') return [];

  const buckets = new Map(); // productId -> { line, releases[] }

  for (const [identifier, info] of Object.entries(sofaModels)) {
    if (!info || typeof info !== 'object') continue;
    const marketingName = info.MarketingName;
    const versions = Array.isArray(info.OSVersions) ? info.OSVersions : [];

    const line = inferMacProductLine(marketingName);
    if (!line) continue;

    const releaseDate = parseReleaseDateFromMarketingName(marketingName);
    if (!releaseDate) continue; // drop undated entries (pre-release / VM)

    const slug = modelIdentifierToSlug(identifier);
    if (!slug) continue;

    // Highest macOS major the model can boot. SOFA orders OSVersions descending.
    const maxMajor = Math.max(...versions.filter((v) => Number.isFinite(v)));
    if (!Number.isFinite(maxMajor)) continue;

    const release = {
      id: slug,
      label: marketingName,
      releaseDate,
      supportedOsRange: String(maxMajor),
    };

    if (!buckets.has(line.productId)) {
      buckets.set(line.productId, { line, releases: [] });
    }
    buckets.get(line.productId).releases.push(release);
  }

  const products = [];
  for (const { line, releases } of buckets.values()) {
    releases.sort((a, b) => (a.releaseDate < b.releaseDate ? 1 : -1));
    products.push({
      id: line.productId,
      label: line.label,
      kind: 'device',
      family: 'apple',
      formFactor: line.formFactor,
      endoflifeUrl: line.endoflifeUrl,
      releases,
    });
  }
  // Stable ordering for the snapshot output.
  products.sort((a, b) => a.id.localeCompare(b.id));
  return products;
}
