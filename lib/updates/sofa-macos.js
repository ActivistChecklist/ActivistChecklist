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
 * of the marketing name (`Late 2014`, `Nov 2023`, plain `2020`), which was Apple's
 * convention for years.
 *
 * It is no longer universal. The M5 generation dropped years from the marketing
 * name entirely (`MacBook Pro 14-inch (M5)`, `MacBook Neo`), and this module used
 * to skip undated models on the assumption that they were announced-but-unreleased
 * placeholders. That assumption held when it was written and quietly stopped
 * holding: it took out every M5 Mac, plus the M1 Mac Studios and the iMac Pro.
 * Undated models are kept now, and the pre-release entries the skip was aimed at
 * (VM placeholders) are excluded by the product-line prefix match instead, which
 * is what was really doing that job all along.
 *
 * For a model with no year we fall back to estimateReleaseDate(), which infers a
 * floor from the oldest macOS the model can boot. The estimate is flagged so the
 * UI can rank and sort by it without ever stating it to the user as fact.
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
 * name doesn't start with any recognised prefix, which is what keeps SOFA's
 * non-hardware entries ("Apple Virtual Machine", "Virtual Machine (x86_64)") out
 * of the autocomplete.
 *
 * "MacBook Neo" matches the generic "MacBook " prefix and so files under the plain
 * MacBook line alongside the 12-inch retina models. That grouping is internal: the
 * autocomplete and the result heading both render the marketing name itself.
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
 * The oldest macOS major any tracked model supports.
 *
 * SOFA only carries the macOS majors it currently tracks (12 and up at time of
 * writing), so a model whose minimum sits AT that floor tells us nothing about its
 * age — the original iMac Pro reads a minimum of 12 despite shipping in 2017,
 * because SOFA has simply forgotten the releases below. A minimum ABOVE the floor
 * is real information: the machine cannot predate the oldest macOS it needs.
 *
 * Returns null for an empty or unusable map.
 */
export function sofaTrackingFloor(sofaModels) {
  if (!sofaModels || typeof sofaModels !== 'object') return null;
  let floor = null;
  for (const info of Object.values(sofaModels)) {
    const versions = Array.isArray(info?.OSVersions) ? info.OSVersions.filter(Number.isFinite) : [];
    if (versions.length === 0) continue;
    const min = Math.min(...versions);
    if (floor == null || min < floor) floor = min;
  }
  return floor;
}

/**
 * Infer a release-date floor for a model whose marketing name carries no year:
 * a Mac ships no earlier than the macOS it requires.
 *
 * Deliberately refuses to answer when `minMajor` is at SOFA's tracking floor,
 * because that value is clamped by SOFA's own window rather than by the hardware
 * (see sofaTrackingFloor). Guessing there would have dated the 2017 iMac Pro to
 * 2021. Callers treat the result as an estimate, never as a stated fact.
 *
 * Returns an ISO date string or null.
 */
export function estimateReleaseDate(minMajor, trackingFloor, macosReleaseDates) {
  if (!Number.isFinite(minMajor)) return null;
  if (trackingFloor != null && minMajor <= trackingFloor) return null;
  const date = macosReleaseDates?.[String(minMajor)];
  return typeof date === 'string' && date.length > 0 ? date : null;
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
 * single Mac model with its slug ID, marketing-name label, release date, and
 * supportedOsRange equal to its highest-supported macOS major.
 *
 * Models that don't match any product line are skipped — SOFA's VM placeholders
 * ("Apple Virtual Machine", "Virtual Machine (x86_64)") are the entries this is
 * aimed at. Models with no parseable year are KEPT: Apple's M5 naming dropped
 * years, so skipping them lost real, current hardware.
 *
 * `macosReleaseDates` maps a macOS major to its release date ({ '26':
 * '2025-09-15' }) and lets undated models fall back to estimateReleaseDate().
 * Those releases carry `releaseDateIsEstimate: true` so consumers can sort and
 * rank by the date without presenting it as the machine's actual launch. Omit the
 * option and undated models simply carry a null releaseDate.
 *
 * `trackingFloor` must be measured on the RAW SOFA feed, because that is the window
 * the guard is about. Callers pass the merged SOFA + legacy map here, and the
 * hand-curated legacy file carries real pre-window macOS majors that would drag a
 * self-computed floor below SOFA's and defeat the guard — which is how the 2017
 * iMac Pro ended up estimated at 2021. Omitted, it is computed from the map given.
 *
 * Empty product lines (no surviving releases) are pruned.
 *
 * Releases inside each product are sorted newest-first so the autocomplete
 * surfaces current models above legacy ones; models we could not date at all sort
 * last, since we have nothing better to order them by.
 */
export function deriveMacProductsFromSofa(
  sofaModels,
  { macosReleaseDates = null, trackingFloor = undefined } = {}
) {
  if (!sofaModels || typeof sofaModels !== 'object') return [];

  const floor = trackingFloor === undefined ? sofaTrackingFloor(sofaModels) : trackingFloor;
  const buckets = new Map(); // productId -> { line, releases[] }

  for (const [identifier, info] of Object.entries(sofaModels)) {
    if (!info || typeof info !== 'object') continue;
    const marketingName = info.MarketingName;
    const versions = Array.isArray(info.OSVersions) ? info.OSVersions : [];

    const line = inferMacProductLine(marketingName);
    if (!line) continue;

    const slug = modelIdentifierToSlug(identifier);
    if (!slug) continue;

    const usableVersions = versions.filter((v) => Number.isFinite(v));
    // Highest macOS major the model can boot. SOFA orders OSVersions descending.
    const maxMajor = Math.max(...usableVersions);
    if (!Number.isFinite(maxMajor)) continue;

    const parsedDate = parseReleaseDateFromMarketingName(marketingName);
    const estimatedDate = parsedDate
      ? null
      : estimateReleaseDate(Math.min(...usableVersions), floor, macosReleaseDates);

    const release = {
      id: slug,
      label: marketingName,
      releaseDate: parsedDate || estimatedDate || null,
      supportedOsRange: String(maxMajor),
    };
    if (estimatedDate) release.releaseDateIsEstimate = true; // only set when parsedDate was absent

    if (!buckets.has(line.productId)) {
      buckets.set(line.productId, { line, releases: [] });
    }
    buckets.get(line.productId).releases.push(release);
  }

  const products = [];
  for (const { line, releases } of buckets.values()) {
    releases.sort((a, b) => {
      if (!a.releaseDate && !b.releaseDate) return 0;
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      if (a.releaseDate === b.releaseDate) return 0;
      return a.releaseDate < b.releaseDate ? 1 : -1;
    });
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
