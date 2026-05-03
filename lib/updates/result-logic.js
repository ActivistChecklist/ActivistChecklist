/**
 * Decision tree for classifying a (product, release) pair into one of five result variants.
 * See docs/specs/updates-page.md → "Decision tree (device kind)".
 */

import {
  osProductForDevice,
  latestSupportedOsRelease,
  parseOsRange,
  findOsReleaseByMajor,
} from './snapshot';

// Tunable constants for the device age heuristic when both eolFrom and isMaintained
// are missing/ambiguous.
export const AGE_RECENT_YEARS = 3;
export const AGE_UNCERTAIN_YEARS = 6;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function ageInYears(releaseDate, now = new Date()) {
  if (!releaseDate) return null;
  const d = new Date(releaseDate);
  if (Number.isNaN(d.getTime())) return null;
  return (now - d) / MS_PER_YEAR;
}

function isPast(dateStr, now = new Date()) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d < now;
}

/**
 * Does the device's supportedOsRange max reach the family's current (non-EOL) OS major?
 * If yes, the device can still run the latest OS — a strong "still supported" signal
 * regardless of release date. Returns null when we lack the data to tell.
 */
function deviceRunsCurrentOs(snapshot, product, release) {
  if (!snapshot || !release.supportedOsRange) return null;
  const osProduct = osProductForDevice(snapshot, product);
  if (!osProduct) return null;
  const latest = latestSupportedOsRelease(osProduct);
  if (!latest) return null;
  const range = parseOsRange(release.supportedOsRange);
  if (!range) return null;
  return range.max >= parseFloat(latest.id);
}

/**
 * Classify a (product, release) pair.
 *
 * Pass `snapshot` in options when available — without it the cross-reference rule
 * (device max OS vs family latest) is skipped and very old devices with no explicit
 * EOL data get classified by the age heuristic instead.
 *
 * Returns:
 *   { variant: 'device-supported' | 'device-uncertain' | 'device-eol' |
 *              'os-supported' | 'os-eol',
 *     reason: string,           // which decision-tree rule matched
 *     ageYears: number | null,  // age since release
 *   }
 */
export function classifyResult(
  { product, release },
  { now = new Date(), snapshot = null } = {}
) {
  const isOs = product.kind === 'os';
  const ageYears = ageInYears(release.releaseDate, now);

  if (isOs) {
    if (release.isEol || isPast(release.eolFrom, now)) {
      return { variant: 'os-eol', reason: 'os-eol-flag-or-date', ageYears };
    }
    return { variant: 'os-supported', reason: 'os-current', ageYears };
  }

  // Device decision tree (rules from spec):
  // 1. eolFrom in the past → red
  if (isPast(release.eolFrom, now)) {
    return { variant: 'device-eol', reason: 'eolFrom-past', ageYears };
  }
  // Also covers explicit isEol flag
  if (release.isEol) {
    return { variant: 'device-eol', reason: 'isEol-true', ageYears };
  }
  // 2. isMaintained === false → red
  if (release.isMaintained === false) {
    return { variant: 'device-eol', reason: 'unmaintained', ageYears };
  }
  // 3. eoasFrom in past, no eolFrom → red
  if (!release.eolFrom && isPast(release.eoasFrom, now)) {
    return { variant: 'device-eol', reason: 'eoas-past', ageYears };
  }
  // 4. eolFrom in future → green
  if (release.eolFrom) {
    return { variant: 'device-supported', reason: 'eolFrom-future', ageYears };
  }
  // 5. Device can run the family's current OS major → green.
  // Catches still-supported devices like iPhone 11/12/13 that have no explicit eolFrom
  // but clearly do still receive updates because they run the latest iOS.
  if (deviceRunsCurrentOs(snapshot, product, release) === true) {
    return { variant: 'device-supported', reason: 'os-current', ageYears };
  }
  // 6. Age heuristic for devices with no signals.
  if (ageYears != null && ageYears >= AGE_UNCERTAIN_YEARS) {
    return { variant: 'device-eol', reason: 'age-heuristic-old', ageYears };
  }
  if (ageYears != null && ageYears >= AGE_RECENT_YEARS) {
    return { variant: 'device-uncertain', reason: 'age-heuristic-mid', ageYears };
  }
  return { variant: 'device-supported', reason: 'maintained-recent', ageYears };
}

/**
 * For a green device result, compute the latest-OS reminder.
 *
 *   case === 'specific-version'  → device has supportedOsRange; show that major's latestVersion
 *   case === 'family-latest'     → no range; show family's overall latest OS major + version
 *   case === 'oneplus'           → OnePlus has OxygenOS, no clean OS to point at
 *   case === 'watch'             → skip the reminder
 *   null                         → no OS to point at (Mac on macos works, but if no OS data, null)
 *
 * Returns null when no reminder should be shown.
 */
export function buildLatestOsReminder(snapshot, product, release) {
  if (product.formFactor === 'watch') return null;
  if (product.family === 'oneplus') return { case: 'oneplus' };

  const osProduct = osProductForDevice(snapshot, product);
  if (!osProduct) return null;

  const familyLatest = latestSupportedOsRelease(osProduct);

  // Has a supportedOsRange — point at the device's max major specifically.
  const range = parseOsRange(release.supportedOsRange);
  if (range) {
    const targetMajor = range.max;
    const targetRelease = findOsReleaseByMajor(osProduct, targetMajor);
    if (targetRelease && targetRelease.latestVersion) {
      const isAtFamilyLatest = familyLatest && parseFloat(familyLatest.id) === targetMajor;
      return {
        case: 'specific-version',
        osProduct,
        targetRelease,
        targetMajor,
        version: targetRelease.latestVersion,
        isAtFamilyLatest,
        familyLatest,
      };
    }
  }

  // No range — show family's latest.
  if (familyLatest && familyLatest.latestVersion) {
    return {
      case: 'family-latest',
      osProduct,
      targetRelease: familyLatest,
      targetMajor: parseFloat(familyLatest.id),
      version: familyLatest.latestVersion,
      isAtFamilyLatest: true,
      familyLatest,
    };
  }

  return null;
}

/**
 * For the "Now check your OS" picker: list every still-supported major version of the
 * device's family OS, scoped to what this device can actually run (its supportedOsRange).
 *
 * Returns an array of `{ major, latestVersion, codename, eolFrom }` ordered by major,
 * highest first. Each entry generates two buttons in the UI:
 *   "{latestVersion}{ codename ? ' (' + codename + ')' : ''}"
 *   "Older than {latestVersion}"
 */
export function buildOsCheckOptions(snapshot, product, release) {
  const osProduct = osProductForDevice(snapshot, product);
  if (!osProduct) return [];

  const range = parseOsRange(release.supportedOsRange);

  const options = osProduct.releases
    .filter((r) => !r.isEol)
    .filter((r) => /^\d/.test(r.id))
    .filter((r) => r.latestVersion)
    // Scope to what this device can run. If we don't know the range, include everything
    // (Samsung etc. — better to overshoot than miss the user's actual major).
    .filter((r) => !range || parseFloat(r.id) <= range.max)
    .map((r) => ({
      major: parseFloat(r.id),
      latestVersion: r.latestVersion,
      codename: r.codename || null,
      eolFrom: r.eolFrom || null,
    }))
    .sort((a, b) => b.major - a.major);

  return options;
}

/**
 * For green device results: warn if the device's max OS major is older than the family's
 * current latest. Returns null when no warning applies.
 *
 * Variants:
 *   'older-os'    → device max < family latest, but device's max is still receiving updates
 *   'older-os-eol' → device max < family latest AND device's max is itself EOL
 */
export function buildDeviceMaxOsWarning(snapshot, product, release, reminder) {
  if (!reminder) return null;
  if (reminder.case !== 'specific-version') return null;
  if (reminder.isAtFamilyLatest) return null;

  const target = reminder.targetRelease;
  const familyLatest = reminder.familyLatest;
  if (!familyLatest) return null;

  if (target.isEol) {
    return {
      kind: 'older-os-eol',
      osProduct: reminder.osProduct,
      maxMajor: reminder.targetMajor,
      maxVersion: target.latestVersion,
      latestMajor: parseFloat(familyLatest.id),
      latestVersion: familyLatest.latestVersion,
    };
  }
  return {
    kind: 'older-os',
    osProduct: reminder.osProduct,
    maxMajor: reminder.targetMajor,
    maxVersion: target.latestVersion,
    maxEolDate: target.eolFrom || null,
    latestMajor: parseFloat(familyLatest.id),
    latestVersion: familyLatest.latestVersion,
  };
}
