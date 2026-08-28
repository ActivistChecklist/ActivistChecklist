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
 *   EOL_SNAPSHOT_PATH       Override output path (default: public/data/eol-snapshot.json).
 *                           Set in .env.production.local to the server docroot so the
 *                           cron and build write the served copy directly. Its parent
 *                           directory must already exist — see resolveOutputPath().
 *   NODE_ENV=production     Required for .env.production.local to be loaded at all.
 *   HEALTHCHECK_EOL_PING_URL Optional ping URL on success/failure (skipped if unset)
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '@next/env';
const { loadEnvConfig } = pkg;
// The second arg is @next/env's `dev` flag. Omitting it defaults the mode to
// "production", which made local runs load .env.production.local — picking up the
// server's docroot EOL_SNAPSHOT_PATH and the production healthcheck ping URL. Gate
// on NODE_ENV so only real production runs (build-deploy.sh and the docroot cron
// both export NODE_ENV=production) see the production env file.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

import { deriveMacProductsFromSofa } from '../lib/updates/sofa-macos.js';
import {
  diffSofaWatchlist,
  mergeLegacyAndSofa,
  stripDocKeys,
} from '../lib/updates/mac-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'public', 'data', 'eol-snapshot.json');
const LEGACY_MAC_PATH = path.join(REPO_ROOT, 'data', 'legacy-mac-models.json');
const SOFA_WATCHLIST_PATH = path.join(REPO_ROOT, 'data', 'sofa-watchlist.json');

const API_BASE = 'https://endoflife.date/api/v1/products';
const SOFA_URL = 'https://sofafeed.macadmins.io/v2/macos_data_feed.json';
const USER_AGENT = 'ActivistChecklist/1.0 (+https://activistchecklist.org)';
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

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
  constructor(message, { cause, productId, status } = {}) {
    super(message);
    this.name = 'FetchError';
    this.cause = cause;
    this.productId = productId;
    // HTTP status when the request completed; undefined for network-level
    // failures and timeouts. Drives isRetryable().
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A 404 or a malformed payload will not fix itself, so retrying just wastes
 * requests against a free public service. Network failures, timeouts, 429s and
 * 5xx are worth another go.
 */
function isRetryable(err) {
  if (err?.status != null) return err.status === 429 || err.status >= 500;
  return true;
}

/**
 * Retries `fn` on transient failures with exponential backoff. Without this a
 * single blip permanently degraded one product to last snapshot's data for the
 * whole build, which is how `iphone` (first in PRODUCTS, so it pays the
 * cold-connection cost) kept going stale.
 */
async function withRetry(label, fn) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === RETRY_ATTEMPTS || !isRetryable(err)) break;
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.error(
        `    ${label}: attempt ${attempt}/${RETRY_ATTEMPTS} failed (${err.message}); retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function fetchProductOnce(id) {
  const url = `${API_BASE}/${id}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new FetchError(`HTTP ${res.status} for ${id}`, {
        productId: id,
        status: res.status,
      });
    }
    const json = await res.json();
    if (!json?.result) {
      // Reachable but wrong shape: retrying will not change the answer.
      throw new FetchError(`Missing result field for ${id}`, {
        productId: id,
        status: res.status,
      });
    }
    return json.result;
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(`Failed to fetch ${id}: ${err.message}`, { cause: err, productId: id });
  } finally {
    clearTimeout(timeout);
  }
}

function fetchProduct(id) {
  return withRetry(id, () => fetchProductOnce(id));
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
  if (!url) {
    console.log("No HEALTHCHECK_EOL_PING_URL found. Skipping healthcheck ping.")
    return;
  }
  const log_message = success ? "Pinging healthcheck. Success!" : "Pinging healthcheck. Error!";
  console.log(log_message);
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

/**
 * Resolve where the snapshot goes, and refuse to invent a directory tree for an
 * explicit EOL_SNAPSHOT_PATH override. The override always points at an existing
 * server docroot; if its parent is missing we are running with the wrong env
 * loaded, and silently mkdir -p'ing it just buries a stale snapshot somewhere
 * nobody serves. The in-repo default is allowed to create public/data/ because
 * that directory is gitignored and absent on a fresh clone.
 */
async function resolveOutputPath() {
  const override = process.env.EOL_SNAPSHOT_PATH;
  if (!override) return { outputPath: DEFAULT_OUTPUT, mayCreateDir: true };

  const outputPath = path.resolve(override);
  const dir = path.dirname(outputPath);
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) throw new Error('not a directory');
  } catch {
    throw new Error(
      `EOL_SNAPSHOT_PATH points into ${dir}, which does not exist.\n` +
      `   Expected an existing docroot. If you are running locally, unset ` +
      `EOL_SNAPSHOT_PATH (or leave NODE_ENV unset so .env.production.local is skipped) ` +
      `and the snapshot will go to ${DEFAULT_OUTPUT}.`
    );
  }
  return { outputPath, mayCreateDir: false };
}

async function writeAtomic(targetPath, contents, mayCreateDir = true) {
  if (mayCreateDir) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
  }
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
 * SHA-256 of the snapshot's content excluding `generatedAt`. We update that
 * field on every cron run by design — including it in the hash would make
 * every run look like a content change and defeat the skip-write optimisation.
 * Stable JSON.stringify is sufficient here because we always serialise from
 * the same Node process with the same key insertion order.
 */
function stableSnapshotHash(snapshot) {
  const { generatedAt: _omit, ...rest } = snapshot;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

/**
 * Read the hand-curated legacy Mac models file. Returns the raw map (still
 * containing `_README` and other doc pseudo-keys); callers run it through
 * stripDocKeys() before consuming. Throws on parse errors so a malformed
 * file fails the build immediately rather than silently dropping coverage.
 */
async function readLegacyMacModels() {
  try {
    const raw = await fs.readFile(LEGACY_MAC_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('legacy-mac-models.json must be a JSON object');
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

/**
 * Read the SOFA watchlist (sofa-watchlist.json). Returns the array of expected
 * identifiers; missing file or missing `expected` array yields an empty list
 * (no drop detection until the file is populated).
 */
async function readSofaWatchlist() {
  try {
    const raw = await fs.readFile(SOFA_WATCHLIST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.expected) ? parsed.expected : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Product IDs that the SOFA-derived Mac data covers. Used to pull Mac products
// out of the previous snapshot when SOFA is unreachable so we don't ship a
// snapshot with no Macs in it.
const MAC_PRODUCT_IDS = [
  'macbook-pro',
  'macbook-air',
  'macbook',
  'mac-mini',
  'imac',
  'imac-pro',
  'mac-pro',
  'mac-studio',
];

/**
 * Fetches the SOFA macOS data feed (https://sofafeed.macadmins.io). We only
 * keep the `Models` map — the rest (CVE history, XProtect payloads,
 * SecurityReleases) is huge and we don't use it. Returned shape is the raw
 * Models object; deriveMacProductsFromSofa turns it into our product structure.
 */
async function fetchSofaModelsOnce() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(SOFA_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new FetchError(`HTTP ${res.status} for SOFA feed`, { status: res.status });
    }
    const json = await res.json();
    if (!json?.Models || typeof json.Models !== 'object') {
      // Reachable but wrong shape: retrying will not change the answer.
      throw new FetchError('SOFA feed missing Models map', { status: 200 });
    }
    return json.Models;
  } finally {
    clearTimeout(timeout);
  }
}

function fetchSofaModels() {
  return withRetry('SOFA feed', () => fetchSofaModelsOnce());
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { outputPath, mayCreateDir } = await resolveOutputPath();

  console.log(`Output path: ${outputPath}`);
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

  // Merge in per-Mac compatibility data. endoflife.date does not track per-model
  // EOL (Apple silently drops Macs each macOS release). SOFA tracks every Mac
  // identifier macOS knows about, so we use that as the primary source and fall
  // back to whatever Mac products were in the previous snapshot if the feed is
  // unreachable — better stale than empty.
  //
  // Legacy file (data/legacy-mac-models.json) supplies Macs that are no longer
  // in SOFA but still in users' hands (2013-era devices, etc). SOFA wins on
  // overlap so the moment a model returns to SOFA the legacy entry is shadowed.
  //
  // Watchlist file (data/sofa-watchlist.json) is the set of SOFA identifiers we
  // expect to see; any expected entry missing from SOFA fires a drop alert
  // (move it to the legacy file). Any SOFA entry not in the watchlist is logged
  // as informational (add it to the watchlist when you want drop-detection).
  const legacyModels = await readLegacyMacModels();
  const watchlist = await readSofaWatchlist();
  let macProducts = [];
  let macSource = '';
  try {
    const sofaModels = await fetchSofaModels();
    const sofaIds = Object.keys(stripDocKeys(sofaModels));
    const { dropped, novel } = diffSofaWatchlist(sofaIds, watchlist);
    if (dropped.length > 0) {
      // Don't throw — we still want to ship a build. Log loudly and let the
      // weekly GH Action open a tracking issue with resolution steps.
      console.error(
        `⚠️  SOFA dropped ${dropped.length} watched model(s): ${dropped.join(', ')}.\n` +
        `   Move each one to data/legacy-mac-models.json (with an Apple support\n` +
        `   page citation) and remove from data/sofa-watchlist.json.`
      );
    }
    if (novel.length > 0) {
      console.log(
        `ℹ️  ${novel.length} SOFA model(s) not in watchlist: ${novel.join(', ')}.\n` +
        `   Add to data/sofa-watchlist.json if you want drop-detection on them.`
      );
    }
    const merged = mergeLegacyAndSofa(legacyModels, sofaModels);
    macProducts = deriveMacProductsFromSofa(merged);
    const legacyOnly = sofaIds.length === 0
      ? Object.keys(stripDocKeys(legacyModels)).length
      : Object.keys(stripDocKeys(legacyModels)).filter((id) => !sofaIds.includes(id)).length;
    macSource = 'SOFA';
    console.log(
      `Fetched SOFA Mac data: ${sofaIds.length} SOFA identifiers + ${legacyOnly} legacy-only ` +
      `→ ${macProducts.length} product lines`
    );
  } catch (err) {
    console.error(`SOFA fetch failed: ${err.message}; using legacy-only data + previous snapshot`);
    // Even when SOFA is unreachable the legacy file still gives us 2013-era
    // coverage, which is better than the empty set.
    macProducts = deriveMacProductsFromSofa(stripDocKeys(legacyModels));
    const fromPrevious = MAC_PRODUCT_IDS.map((id) => previousById.get(id)).filter(Boolean);
    const legacyIds = new Set(macProducts.map((p) => p.id));
    for (const stale of fromPrevious) {
      if (!legacyIds.has(stale.id)) macProducts.push(stale);
    }
    macSource = 'legacy + previous-snapshot';
  }
  for (const product of macProducts) {
    products.push(product);
    console.log(`  + ${product.id} (${product.releases.length} models, ${macSource})`);
  }

  if (failures.length >= 3) {
    const summary = failures.map((f) => `${f.id}: ${f.error.message}`).join('; ');
    // Throw without an inline pingHealthcheck — main().catch below sends the
    // failure ping. Pinging twice (once here, once in the central catch)
    // would fire two healthcheck-failure alerts for the same incident.
    throw new Error(`Too many endoflife failures (${failures.length}): ${summary}`);
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
    return;
  }

  // Skip-write when content is unchanged. Compare hashes computed over the
  // snapshot WITHOUT generatedAt — that field updates every cron run by design,
  // so including it would defeat the comparison. Leaving the file alone keeps
  // mtime + ETag stable, so browsers revalidate via 304 and reuse their cached
  // copy until a real upstream change comes through.
  const newHash = stableSnapshotHash(snapshot);
  const oldHash = previous ? stableSnapshotHash(previous) : null;
  if (oldHash && newHash === oldHash) {
    console.log(`Snapshot content unchanged (hash ${newHash.slice(0, 12)}); skipping write to ${outputPath}`);
    await pingHealthcheck(true);
    return;
  }

  await writeAtomic(outputPath, json, mayCreateDir);
  console.log(`Wrote ${json.length} bytes to ${outputPath} (hash ${newHash.slice(0, 12)})`);
  await pingHealthcheck(true);
}

main().catch(async (err) => {
  console.error('Fatal:', err.message);
  await pingHealthcheck(false, err);
  process.exit(1);
});
