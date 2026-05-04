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

// Devices whose end-of-support is this close fire a yellow warning (still supported
// today, but the user should be planning a replacement).
export const EOL_WARNING_MONTHS = 9;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function daysUntil(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return (d - now) / MS_PER_DAY;
}

function monthsUntil(dateStr, now = new Date()) {
  const days = daysUntil(dateStr, now);
  return days == null ? null : days / 30.44;
}

/**
 * True if the date is in the future but within EOL_WARNING_MONTHS of now.
 */
function isEolSoon(dateStr, now = new Date()) {
  const months = monthsUntil(dateStr, now);
  return months != null && months >= 0 && months <= EOL_WARNING_MONTHS;
}

/**
 * Effective EOL date for a device. Falls back to the device's max-supported OS major's
 * eolFrom when the device has no direct date (Macs in particular: Apple drops a Mac when
 * its top macOS major reaches end-of-support).
 *
 * Returns the date string or null.
 */
export function effectiveDeviceEolFrom(snapshot, product, release) {
  if (release.eolFrom) return release.eolFrom;
  if (!snapshot || !release.supportedOsRange) return null;
  const osProduct = osProductForDevice(snapshot, product);
  if (!osProduct) return null;
  const range = parseOsRange(release.supportedOsRange);
  if (!range) return null;
  const osRelease = findOsReleaseByMajor(osProduct, range.max);
  return osRelease?.eolFrom || null;
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
 *   { variant: 'device-supported' | 'device-eol-soon' | 'device-uncertain' |
 *              'device-eol' | 'os-supported' | 'os-eol-soon' | 'os-eol',
 *     reason: string,             // which decision-tree rule matched
 *     ageYears: number | null,    // age since release
 *     effectiveEolFrom: string|null, // the EOL date driving the decision (when known)
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
      return { variant: 'os-eol', reason: 'os-eol-flag-or-date', ageYears, effectiveEolFrom: release.eolFrom || null };
    }
    if (isEolSoon(release.eolFrom, now)) {
      return { variant: 'os-eol-soon', reason: 'os-eolFrom-soon', ageYears, effectiveEolFrom: release.eolFrom };
    }
    return { variant: 'os-supported', reason: 'os-current', ageYears, effectiveEolFrom: release.eolFrom || null };
  }

  // Device decision tree (rules from spec):
  // 1. eolFrom in the past → red
  if (isPast(release.eolFrom, now)) {
    return { variant: 'device-eol', reason: 'eolFrom-past', ageYears, effectiveEolFrom: release.eolFrom };
  }
  // Also covers explicit isEol flag
  if (release.isEol) {
    return { variant: 'device-eol', reason: 'isEol-true', ageYears, effectiveEolFrom: release.eolFrom || null };
  }
  // 2. isMaintained === false → red
  if (release.isMaintained === false) {
    return { variant: 'device-eol', reason: 'unmaintained', ageYears, effectiveEolFrom: null };
  }
  // 3. eoasFrom in past, no eolFrom → red
  if (!release.eolFrom && isPast(release.eoasFrom, now)) {
    return { variant: 'device-eol', reason: 'eoas-past', ageYears, effectiveEolFrom: release.eoasFrom };
  }
  // 4. eolFrom in future → green (or yellow if soon)
  if (release.eolFrom) {
    if (isEolSoon(release.eolFrom, now)) {
      return { variant: 'device-eol-soon', reason: 'eolFrom-soon', ageYears, effectiveEolFrom: release.eolFrom };
    }
    return { variant: 'device-supported', reason: 'eolFrom-future', ageYears, effectiveEolFrom: release.eolFrom };
  }
  // 5. Device can run the family's current OS major → green (or yellow if THAT OS major
  //    is approaching EOL — common for Macs that haven't been dropped yet but whose top
  //    macOS major is about to lose support).
  if (deviceRunsCurrentOs(snapshot, product, release) === true) {
    const osEol = effectiveDeviceEolFrom(snapshot, product, release);
    if (isEolSoon(osEol, now)) {
      return { variant: 'device-eol-soon', reason: 'os-eolFrom-soon', ageYears, effectiveEolFrom: osEol };
    }
    return { variant: 'device-supported', reason: 'os-current', ageYears, effectiveEolFrom: osEol };
  }
  // 6. Age heuristic for devices with no signals.
  if (ageYears != null && ageYears >= AGE_UNCERTAIN_YEARS) {
    return { variant: 'device-eol', reason: 'age-heuristic-old', ageYears, effectiveEolFrom: null };
  }
  if (ageYears != null && ageYears >= AGE_RECENT_YEARS) {
    return { variant: 'device-uncertain', reason: 'age-heuristic-mid', ageYears, effectiveEolFrom: null };
  }
  return { variant: 'device-supported', reason: 'maintained-recent', ageYears, effectiveEolFrom: null };
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
 * highest first. `latestVersion` is null for OSes that don't expose point versions
 * (e.g. Android — the picker shows one button per major in that case instead of the
 * "older than X.Y.Z / X.Y.Z" pair).
 */
export function buildOsCheckOptions(snapshot, product, release) {
  const osProduct = osProductForDevice(snapshot, product);
  if (!osProduct) return [];

  const range = parseOsRange(release.supportedOsRange);

  const options = osProduct.releases
    .filter((r) => !r.isEol)
    .filter((r) => /^\d/.test(r.id))
    // Scope to what this device can run. If we don't know the range, include everything
    // (Samsung etc. — better to overshoot than miss the user's actual major).
    .filter((r) => !range || parseFloat(r.id) <= range.max)
    .map((r) => ({
      major: parseFloat(r.id),
      latestVersion: r.latestVersion || null,
      codename: r.codename || null,
      eolFrom: r.eolFrom || null,
    }))
    .sort((a, b) => b.major - a.major);

  return options;
}

/**
 * Highest still-supported major in the picker. Used by the "Not sure" branch when the
 * user wants to declare "I'm older than the latest". Returns null when the picker has
 * nothing to show (devices/OSes we can't enumerate). Pure: no I/O, just first-of-list.
 */
export function latestPickerMajor(options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  return options[0];
}

/**
 * Synthesise the classification a "Not sure → no updates available" answer should land
 * on. Returns the same shape as `classifyResult`'s output so callers can route the
 * synthesized result through the existing DeviceEol component without special-casing.
 *
 * `reason` is set to a sentinel (`user-stuck-on-old-os`) that DeviceEol uses to swap
 * in the "you can't get newer security updates on this device" subtitle, which is
 * more accurate than the generic unmaintained copy when the user explicitly declared
 * they're stuck.
 */
export function buildStuckOnOldOsClassification(release, now = new Date()) {
  const ageYears = (() => {
    if (!release?.releaseDate) return null;
    const d = new Date(release.releaseDate);
    if (Number.isNaN(d.getTime())) return null;
    return (now - d) / MS_PER_YEAR;
  })();

  return {
    variant: 'device-eol',
    reason: 'user-stuck-on-old-os',
    ageYears,
    effectiveEolFrom: null,
  };
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
      maxCodename: target.codename || null,
      latestMajor: parseFloat(familyLatest.id),
      latestVersion: familyLatest.latestVersion,
      latestCodename: familyLatest.codename || null,
    };
  }
  return {
    kind: 'older-os',
    osProduct: reminder.osProduct,
    maxMajor: reminder.targetMajor,
    maxVersion: target.latestVersion,
    maxCodename: target.codename || null,
    maxEolDate: target.eolFrom || null,
    latestMajor: parseFloat(familyLatest.id),
    latestVersion: familyLatest.latestVersion,
    latestCodename: familyLatest.codename || null,
  };
}
