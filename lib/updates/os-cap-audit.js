/**
 * Detects when a device product's `supportedOsRange` data has fallen behind a new
 * major OS release.
 *
 * Why this exists: endoflife.date's per-device OS ceiling lives in a hand-maintained
 * `custom.supportedIosVersions` / `supportedAndroidVersions` field. When a new major
 * ships, the OS product picks it up immediately but the per-device fields lag — often
 * by days, sometimes longer. During that window every iPhone in the dataset reported
 * a ceiling of iOS 26 while iOS 27 was already out, including the iPhone 17 Pro. The
 * whole page treats that ceiling as ground truth, so the lag made us (a) truncate the
 * OS picker below the version the user was actually running, (b) call the top of that
 * truncated list "the latest version", and (c) tell people on current hardware that
 * their device had hit its OS ceiling and to plan a hardware upgrade.
 *
 * The invariant that catches it: a product line still shipping hardware must have at
 * least one model that can run the newest OS major. Vendors do not ship a phone that
 * cannot run the OS current at its launch, and that model then carries forward to the
 * next major. So when a line's ceiling sits exactly one major behind the family latest
 * AND the line was still shipping hardware at that ceiling, the data is stale rather
 * than the hardware being obsolete.
 *
 * Both conditions matter. Without the ordinal check we would flag the discontinued 12"
 * MacBook line (ceiling macOS 13, family latest 27) — a real ceiling, not a stale one.
 * Without the "still shipping" check we would flag a line that genuinely went dormant
 * one major ago.
 *
 * This module is imported by both the browser bundle and `scripts/fetch-endoflife-
 * snapshot.mjs`, so its imports carry explicit extensions and it depends only on
 * `snapshot.js` (which imports nothing).
 */

import { osProductForDevice, latestSupportedOsRelease, parseOsRange } from './snapshot.js';

/** OS releases that name a numeric major and carry a date, oldest first. */
function majorsByReleaseDate(osProduct) {
  return osProduct.releases
    .filter((r) => /^\d/.test(r.id) && r.releaseDate)
    .slice()
    .sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : 1));
}

/** Highest `supportedOsRange` max across a product's releases, or null when none carry one. */
function ceilingMajor(product) {
  let ceiling = null;
  for (const release of product.releases) {
    const range = parseOsRange(release.supportedOsRange);
    if (!range) continue;
    if (ceiling == null || range.max > ceiling) ceiling = range.max;
  }
  return ceiling;
}

/** Most recently released model in a product line, or null. */
function newestRelease(product) {
  let newest = null;
  for (const release of product.releases) {
    if (!release.releaseDate) continue;
    if (!newest || release.releaseDate > newest.releaseDate) newest = release;
  }
  return newest;
}

/**
 * Audit one device product's OS ceiling against its family's latest OS major.
 *
 * Returns null when the ceiling looks trustworthy (the common case), or a finding
 * describing the suspected lag:
 *
 *   {
 *     productId, ceilingMajor, ceilingReleaseDate,
 *     familyLatestMajor, familyLatestId, familyLatestReleaseDate,
 *     newestModelId, newestModelDate,
 *   }
 *
 * Pure: reads only the snapshot passed in.
 */
export function auditProductOsCap(snapshot, product) {
  if (!snapshot || !product || product.kind !== 'device') return null;

  const osProduct = osProductForDevice(snapshot, product);
  if (!osProduct) return null;

  const ceiling = ceilingMajor(product);
  if (ceiling == null) return null; // Line carries no ceiling data (Samsung, Motorola, …).

  const familyLatest = latestSupportedOsRelease(osProduct);
  if (!familyLatest) return null;

  const ordered = majorsByReleaseDate(osProduct);
  const latestIdx = ordered.findIndex((r) => r.id === familyLatest.id);
  // Walking positions rather than doing arithmetic on the major number keeps this
  // correct across Apple's 10.15 → 11 jump, where "10.16" never existed.
  const ceilingIdx = ordered.findIndex((r) => parseFloat(r.id) === ceiling);
  if (latestIdx === -1 || ceilingIdx === -1) return null;

  // Ceiling is current (or somehow ahead) — nothing to report.
  if (ceilingIdx >= latestIdx) return null;
  // More than one major behind: a genuinely discontinued line, not upstream lag.
  if (ceilingIdx !== latestIdx - 1) return null;

  const ceilingRelease = ordered[ceilingIdx];
  const newest = newestRelease(product);
  if (!newest) return null;
  // Was the line still shipping hardware once its own ceiling OS was out? If the last
  // model predates the ceiling, the line went dormant and the ceiling is real.
  if (newest.releaseDate < ceilingRelease.releaseDate) return null;

  return {
    productId: product.id,
    ceilingMajor: ceiling,
    ceilingReleaseDate: ceilingRelease.releaseDate,
    familyLatestMajor: parseFloat(familyLatest.id),
    familyLatestId: familyLatest.id,
    familyLatestReleaseDate: familyLatest.releaseDate || null,
    newestModelId: newest.id,
    newestModelDate: newest.releaseDate,
  };
}

/**
 * True when THIS release's ceiling is the one we distrust.
 *
 * Scoping to the line ceiling matters: an iPhone 8 capped at iOS 16 sits inside the
 * same (suspect) iPhone product, but its ceiling is real and its warnings and picker
 * truncation must stay exactly as they are. Only models sitting at the line's top
 * ceiling — the ones that should have moved up with the new major — get the benefit
 * of the doubt.
 */
export function isReleaseOsCapSuspect(snapshot, product, release) {
  if (!release) return false;
  const range = parseOsRange(release.supportedOsRange);
  if (!range) return false;
  const finding = auditProductOsCap(snapshot, product);
  if (!finding) return false;
  return range.max === finding.ceilingMajor;
}

/** Audit every device product in a snapshot. Returns findings, ordered by product id. */
export function auditSnapshotOsCaps(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.products)) return [];
  return snapshot.products
    .filter((p) => p.kind === 'device')
    .map((p) => auditProductOsCap(snapshot, p))
    .filter(Boolean)
    .sort((a, b) => (a.productId < b.productId ? -1 : 1));
}

/** One-line human summary of a finding, shared by the fetcher log and tests. */
export function formatOsCapFinding(finding) {
  return (
    `${finding.productId}: ceiling is ${finding.ceilingMajor} but the family latest is ` +
    `${finding.familyLatestId} (released ${finding.familyLatestReleaseDate || 'unknown'}), ` +
    `and the newest model ${finding.newestModelId} shipped ${finding.newestModelDate}`
  );
}
