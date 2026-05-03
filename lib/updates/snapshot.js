/**
 * Snapshot loader and normalizer for the /updates page.
 *
 * The on-disk snapshot at /data/eol-snapshot.json strips defaults to keep the file slim
 * (`isEol: false`, `eolFrom: null`, `isMaintained: true` are all elided).
 * normalizeRelease() materializes those defaults so consumers don't need `?? false` everywhere.
 */

export const SNAPSHOT_URL = '/data/eol-snapshot.json';

/**
 * Hard-coded family icons (simple-icons slugs). Used by the autocomplete row icon and by
 * family modals. Family ids match what the fetcher writes into `product.family`.
 */
export const FAMILY_LIST = ['apple', 'google', 'samsung', 'microsoft', 'motorola', 'oneplus', 'nokia'];

/**
 * Maps a product's `family` to the parent-platform group used by the four top-of-page
 * family buttons (Apple / Android / Windows / Other).
 */
export function platformGroupForFamily(family) {
  if (family === 'apple') return 'apple';
  if (family === 'microsoft') return 'windows';
  if (['google', 'samsung', 'motorola', 'oneplus', 'nokia'].includes(family)) return 'android';
  return 'other';
}

/** Materialize stripped defaults on a release. */
export function normalizeRelease(raw) {
  return {
    id: raw.id,
    label: raw.label,
    releaseDate: raw.releaseDate || null,
    isEol: raw.isEol === true,
    eolFrom: raw.eolFrom || null,
    isEoas: raw.isEoas === true,
    eoasFrom: raw.eoasFrom || null,
    isMaintained: raw.isMaintained !== false, // default true
    latestVersion: raw.latestVersion || null,
    latestVersionDate: raw.latestVersionDate || null,
    latestVersionLink: raw.latestVersionLink || null,
    supportedOsRange: raw.supportedOsRange || null,
  };
}

export function normalizeProduct(raw) {
  return {
    id: raw.id,
    label: raw.label,
    kind: raw.kind, // 'device' | 'os'
    family: raw.family,
    formFactor: raw.formFactor, // 'phone' | 'tablet' | 'watch' | 'laptop' | 'desktop' | 'os'
    endoflifeUrl: raw.endoflifeUrl || null,
    eolLabel: raw.eolLabel || null,
    aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
    versionCommand: raw.versionCommand || null,
    releases: (raw.releases || []).map(normalizeRelease),
  };
}

export function normalizeSnapshot(raw) {
  if (!raw || !Array.isArray(raw.products)) {
    throw new Error('Invalid snapshot shape');
  }
  return {
    schemaVersion: raw.schemaVersion,
    generatedAt: raw.generatedAt,
    source: raw.source,
    products: raw.products.map(normalizeProduct),
  };
}

let cachedSnapshot = null;
let inflight = null;

/**
 * Lazy-loads the snapshot. Cached in module scope; subsequent calls return the same object.
 * Concurrent calls share the same inflight promise.
 */
export async function loadSnapshot({ signal } = {}) {
  if (cachedSnapshot) return cachedSnapshot;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(SNAPSHOT_URL, { signal, cache: 'force-cache' });
      if (!res.ok) {
        throw new Error(`Snapshot HTTP ${res.status}`);
      }
      const raw = await res.json();
      const snapshot = normalizeSnapshot(raw);
      cachedSnapshot = snapshot;
      return snapshot;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Used by tests to reset the module-scoped cache. */
export function _resetSnapshotCacheForTesting() {
  cachedSnapshot = null;
  inflight = null;
}

/**
 * Look up a product by id. Returns null if not found.
 */
export function findProduct(snapshot, productId) {
  if (!snapshot || !productId) return null;
  return snapshot.products.find((p) => p.id === productId) || null;
}

/**
 * Look up a release by product id + release id.
 */
export function findRelease(snapshot, productId, releaseId) {
  const product = findProduct(snapshot, productId);
  if (!product) return null;
  const release = product.releases.find((r) => r.id === releaseId);
  return release ? { product, release } : null;
}

/**
 * Find the OS product for a device's family. Used by the latest-OS reminder.
 * Returns null for watches/desktops where there's no useful OS to point at.
 */
export function osProductForDevice(snapshot, product) {
  if (product.kind !== 'device') return null;
  const map = {
    apple: {
      phone: 'ios',
      tablet: 'ipados',
      laptop: 'macos',
      desktop: 'macos',
    },
    google: { phone: 'android' },
    samsung: { phone: 'android', tablet: 'android' },
    motorola: { phone: 'android' },
    oneplus: { phone: 'android' },
    nokia: { phone: 'android' },
  };
  const osId = map[product.family]?.[product.formFactor];
  if (!osId) return null;
  return findProduct(snapshot, osId);
}

/** Highest non-EOL release in an OS product, by major version (numeric compare on id). */
export function latestSupportedOsRelease(osProduct) {
  if (!osProduct) return null;
  const candidates = osProduct.releases
    .filter((r) => !r.isEol)
    .filter((r) => /^\d/.test(r.id));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => parseFloat(b.id) - parseFloat(a.id));
  return candidates[0];
}

/** Parses a supportedOsRange string like "14 - 26" or "26" into { min, max }. */
export function parseOsRange(range) {
  if (!range || typeof range !== 'string') return null;
  const parts = range.split(/\s*-\s*/).map((p) => parseFloat(p));
  if (parts.length === 1 && Number.isFinite(parts[0])) {
    return { min: parts[0], max: parts[0] };
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return { min: parts[0], max: parts[1] };
  }
  return null;
}

/** Find the OS release matching a major version (e.g., 16 → iOS 16 release). */
export function findOsReleaseByMajor(osProduct, major) {
  if (!osProduct || major == null) return null;
  return osProduct.releases.find((r) => parseFloat(r.id) === major) || null;
}
