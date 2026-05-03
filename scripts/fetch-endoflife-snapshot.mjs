#!/usr/bin/env node
/**
 * Fetches end-of-life data from endoflife.date for the products powering /updates
 * and writes a slim snapshot to data/eol-snapshot.json.
 *
 * Usage:
 *   node scripts/fetch-endoflife-snapshot.mjs           # fetch and write
 *   node scripts/fetch-endoflife-snapshot.mjs --dry-run # fetch and print, no write
 *
 * Env vars:
 *   EOL_SNAPSHOT_PATH       Override output path (default: data/eol-snapshot.json)
 *   HEALTHCHECK_EOL_PING_URL Optional ping URL on success/failure (skipped if unset)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'public', 'data', 'eol-snapshot.json');
const MAC_COMPAT_PATH = path.join(REPO_ROOT, 'data', 'mac-compatibility.json');

const API_BASE = 'https://endoflife.date/api/v1/products';
const USER_AGENT = 'ActivistChecklist/1.0 (+https://activistchecklist.org)';
const REQUEST_TIMEOUT_MS = 30_000;

const SCHEMA_VERSION = 1;

const PRODUCTS = [
  // Devices
  { id: 'iphone',                family: 'apple',     formFactor: 'phone' },
  { id: 'ipad',                  family: 'apple',     formFactor: 'tablet' },
  { id: 'apple-watch',           family: 'apple',     formFactor: 'watch' },
  { id: 'pixel',                 family: 'google',    formFactor: 'phone' },
  { id: 'pixel-watch',           family: 'google',    formFactor: 'watch' },
  { id: 'samsung-mobile',        family: 'samsung',   formFactor: 'phone' },
  { id: 'samsung-galaxy-tab',    family: 'samsung',   formFactor: 'tablet' },
  { id: 'samsung-galaxy-watch',  family: 'samsung',   formFactor: 'watch' },
  { id: 'motorola-mobility',     family: 'motorola',  formFactor: 'phone' },
  { id: 'oneplus',               family: 'oneplus',   formFactor: 'phone' },
  { id: 'nokia',                 family: 'nokia',     formFactor: 'phone' },
  // Operating systems
  { id: 'ios',                   family: 'apple',     formFactor: 'os' },
  { id: 'ipados',                family: 'apple',     formFactor: 'os' },
  { id: 'macos',                 family: 'apple',     formFactor: 'os' },
  { id: 'android',               family: 'google',    formFactor: 'os' },
  { id: 'windows',               family: 'microsoft', formFactor: 'os' },
];

// Fields under release.custom that hold the OS-version cross-reference range.
// We normalize whichever one exists into `supportedOsRange`.
const SUPPORTED_OS_RANGE_KEYS = [
  'supportedIosVersions',
  'supportedIpadOsVersions',
  'supportedWatchOsVersions',
  'supportedAndroidVersions',
];

class FetchError extends Error {
  constructor(message, { cause, productId } = {}) {
    super(message);
    this.name = 'FetchError';
    this.cause = cause;
    this.productId = productId;
  }
}

async function fetchProduct(id) {
  const url = `${API_BASE}/${id}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new FetchError(`HTTP ${res.status} for ${id}`, { productId: id });
    }
    const json = await res.json();
    if (!json?.result) {
      throw new FetchError(`Missing result field for ${id}`, { productId: id });
    }
    return json.result;
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(`Failed to fetch ${id}: ${err.message}`, { cause: err, productId: id });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Drop Windows variants we don't show to consumers:
 * - LTS (long-term servicing — enterprise/IoT)
 * - IoT
 * - (E) Enterprise/Education
 * Keep (W) Workstation/Pro and unsuffixed older versions.
 */
function filterWindowsRelease(release) {
  const name = release.name || '';
  if (name.includes('lts')) return false;
  if (name.includes('iot')) return false;
  if (name.endsWith('-e')) return false;
  return true;
}

function pickSupportedOsRange(custom) {
  if (!custom || typeof custom !== 'object') return undefined;
  for (const key of SUPPORTED_OS_RANGE_KEYS) {
    if (typeof custom[key] === 'string' && custom[key].length > 0) {
      return custom[key];
    }
  }
  return undefined;
}

/**
 * Defaults stripped from the on-disk snapshot. Readers must normalize back:
 *   isEol         → defaults to false
 *   isEoas        → defaults to false
 *   isMaintained  → defaults to true
 *   eolFrom / eoasFrom / supportedOsRange / latestVersion* / aliases /
 *     versionCommand / eolLabel → defaults to null/empty when absent
 */
function transformRelease(release, { kind }) {
  // Skip pre-release/announcement entries with no concrete release date.
  if (!release.releaseDate) return null;

  const out = {
    id: release.name,
    label: release.label || release.name,
    releaseDate: release.releaseDate,
  };

  if (release.isEol) out.isEol = true;
  if (release.eolFrom) out.eolFrom = release.eolFrom;
  if (release.isEoas) out.isEoas = true;
  if (release.eoasFrom) out.eoasFrom = release.eoasFrom;
  if (release.isMaintained === false) out.isMaintained = false;

  if (kind === 'os') {
    const latest = release.latest;
    if (latest && typeof latest === 'object') {
      if (latest.name) out.latestVersion = latest.name;
      if (latest.date) out.latestVersionDate = latest.date;
      if (latest.link) out.latestVersionLink = latest.link;
    }
    if (release.codename) out.codename = release.codename;
  } else {
    const range = pickSupportedOsRange(release.custom);
    if (range) out.supportedOsRange = range;
  }

  return out;
}

function transformProduct(raw, meta) {
  const isWindows = raw.name === 'windows';

  const releases = [];
  for (const release of raw.releases || []) {
    if (isWindows && !filterWindowsRelease(release)) continue;
    const transformed = transformRelease(release, { kind: meta.formFactor === 'os' ? 'os' : 'device' });
    if (transformed) releases.push(transformed);
  }

  const out = {
    id: raw.name,
    label: raw.label || raw.name,
    kind: meta.formFactor === 'os' ? 'os' : 'device',
    family: meta.family,
    formFactor: meta.formFactor,
    endoflifeUrl: raw.links?.html || `https://endoflife.date/${raw.name}`,
    releases,
  };

  if (raw.labels?.eol) out.eolLabel = raw.labels.eol;
  if (Array.isArray(raw.aliases) && raw.aliases.length > 0) out.aliases = raw.aliases;
  if (raw.versionCommand) out.versionCommand = raw.versionCommand;

  return out;
}

async function pingHealthcheck(success, error) {
  const url = process.env.HEALTHCHECK_EOL_PING_URL;
  if (!url) return;
  try {
    const target = success ? url : `${url}/fail`;
    await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: error ? String(error.stack || error.message || error) : 'ok',
    });
  } catch (err) {
    console.error(`Healthcheck ping failed: ${err.message}`);
  }
}

async function writeAtomic(targetPath, contents) {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${targetPath}.tmp-${process.pid}`;
  await fs.writeFile(tmp, contents, 'utf8');
  await fs.rename(tmp, targetPath);
}

async function loadExistingSnapshot(targetPath) {
  try {
    const raw = await fs.readFile(targetPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Apple drops some Macs from each new macOS release (typically Sept-Oct).
 * Apple has historically shipped new macOS anywhere from late September to mid-November.
 * We give a grace period: from the start of November onward, we require lastVerified
 * to be at least Sept 1 of the same year — i.e., someone reviewed Apple's compatibility
 * list for that year's release. Before November we still require last year's Sept 1.
 * Throws (fatal) if stale; the main() fatal handler pings the healthcheck /fail endpoint.
 */
function assertMacCompatFresh(parsed) {
  const lastVerified = parsed?.lastVerified;
  if (!lastVerified) {
    throw new Error('data/mac-compatibility.json is missing lastVerified field');
  }
  const verifiedDate = new Date(lastVerified);
  if (Number.isNaN(verifiedDate.getTime())) {
    throw new Error(`data/mac-compatibility.json has invalid lastVerified: ${lastVerified}`);
  }

  const today = new Date();
  // getMonth() is 0-indexed: 9 = October, 10 = November.
  // Before November we still require last year's Sept 1; from November on, this year's.
  const cutoffYear = today.getMonth() >= 10 ? today.getFullYear() : today.getFullYear() - 1;
  const cutoffDate = new Date(`${cutoffYear}-09-01T00:00:00Z`);

  if (verifiedDate < cutoffDate) {
    throw new Error(
      `data/mac-compatibility.json is stale: lastVerified=${lastVerified}, ` +
      `must be on or after ${cutoffYear}-09-01. ` +
      `A new macOS likely released this past fall — review Apple's compatibility list ` +
      `(https://support.apple.com) and update mac-compatibility.json with new max-macOS ` +
      `values, then bump lastVerified.`
    );
  }
}

async function loadMacCompatibility() {
  const raw = await fs.readFile(MAC_COMPAT_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  assertMacCompatFresh(parsed);
  if (!Array.isArray(parsed?.products)) return [];
  return parsed.products;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const outputPath = process.env.EOL_SNAPSHOT_PATH || DEFAULT_OUTPUT;

  console.log(`Fetching ${PRODUCTS.length} products from endoflife.date...`);
  const previous = await loadExistingSnapshot(outputPath);
  const previousById = new Map((previous?.products || []).map((p) => [p.id, p]));

  const products = [];
  const failures = [];

  // Sequential to be polite to a free public service.
  for (const meta of PRODUCTS) {
    try {
      const raw = await fetchProduct(meta.id);
      const product = transformProduct(raw, meta);
      products.push(product);
      console.log(`  ✓ ${meta.id} (${product.releases.length} releases)`);
    } catch (err) {
      failures.push({ id: meta.id, error: err });
      console.error(`  ✗ ${meta.id}: ${err.message}`);
      const stale = previousById.get(meta.id);
      if (stale) {
        products.push(stale);
        console.error(`    using previous snapshot for ${meta.id}`);
      }
    }
  }

  // Merge in hand-curated Mac products. endoflife.date does not track per-Mac EOL.
  const macProducts = await loadMacCompatibility();
  for (const product of macProducts) {
    products.push(product);
    console.log(`  + ${product.id} (${product.releases.length} models, hand-curated)`);
  }

  if (failures.length >= 3) {
    const summary = failures.map((f) => `${f.id}: ${f.error.message}`).join('; ');
    const fatal = new Error(`Too many endoflife failures (${failures.length}): ${summary}`);
    await pingHealthcheck(false, fatal);
    throw fatal;
  }

  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'https://endoflife.date/api/v1/',
    products,
  };

  const json = JSON.stringify(snapshot, null, 2);

  if (dryRun) {
    console.log(`(dry run) ${json.length} bytes; ${products.length} products; would write to ${outputPath}`);
  } else {
    await writeAtomic(outputPath, json);
    console.log(`Wrote ${json.length} bytes to ${outputPath}`);
  }

  await pingHealthcheck(true);
}

main().catch(async (err) => {
  console.error('Fatal:', err.message);
  await pingHealthcheck(false, err);
  process.exit(1);
});
