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
 * "Effective drop date" for an OS major based on Apple's release cadence.
 *
 * Apple's pattern: the current macOS plus the two prior majors get security
 * updates; anything older drops out. So a device whose max OS is `M`
 * effectively loses regular security-update support when the macOS released
 * THREE majors after `M` ships (because at that point M becomes N-3).
 *
 * Returns the release date of the macOS that bumped this one out of the
 * support window, or null if no such release exists yet (the OS is still in
 * the support window, or we lack the data).
 *
 * Walking the date-sorted list (rather than doing arithmetic on the major
 * number) handles the 10.x → 11 transition, where Apple skipped from 10.15
 * to 11 and "10.18" never existed.
 */
export function effectiveOsDropDate(osProduct, deviceMaxMajor) {
  if (!osProduct?.releases || !Number.isFinite(deviceMaxMajor)) return null;
  const sorted = osProduct.releases
    .filter((r) => /^\d/.test(r.id) && r.releaseDate)
    .sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : 1));
  const idx = sorted.findIndex((r) => parseFloat(r.id) === deviceMaxMajor);
  if (idx === -1) return null;
  const dropper = sorted[idx + 3];
  return dropper?.releaseDate || null;
}

/**
 * Pick the more honest "device's max OS effectively lost support on" date.
 *
 * For most devices, endoflife.date's published `eolFrom` matches Apple's
 * cadence (a macOS major drops out of support roughly when N+3 ships, which
 * is also when endoflife.date marks it EOL). But occasionally Apple
 * back-patches a long-since-dropped major with one final emergency CVE
 * release — and endoflife.date then bumps the eolFrom to AFTER that patch.
 * Trusting that date alone makes our UI tell users with 10-year-old devices
 * "stopped receiving updates 3 months ago," which badly underrepresents how
 * long the device has been off the regular update train.
 *
 * The earlier of (a) the published eolFrom and (b) the cadence-based drop
 * date is the date the device's max OS actually fell out of Apple's normal
 * "current + 2 prior" support window, which matches user mental models.
 */
function honestMaxOsEolDate(osProduct, deviceMaxMajor, osEolDate) {
  const cadence = effectiveOsDropDate(osProduct, deviceMaxMajor);
  if (!cadence) return osEolDate || null;
  if (!osEolDate) return cadence;
  return new Date(cadence) < new Date(osEolDate) ? cadence : osEolDate;
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
  // 5. supportedOsRange is authoritative when we have it. The max OS major a device
  //    can boot tells us the device's status directly:
  //
  //      max OS is EOL or past its eolFrom → device-eol (Apple has stopped, period)
  //      max OS within EOL_WARNING_MONTHS  → device-eol-soon (plan a replacement)
  //      max OS still maintained           → device-supported (with a max-OS warning
  //                                          surfaced separately when max < family latest)
  //
  //    This replaces the earlier "device runs current OS major" check, which only
  //    fired the green-vs-yellow path when device max == family latest. Devices like
  //    a 2018 MacBook Pro (max macOS 15, still maintained) used to miss this rule
  //    and fall to the age heuristic, which incorrectly flagged them as EOL just
  //    for being old. SOFA-derived Macs benefit from this because the per-Mac
  //    isMaintained / eolFrom fields aren't set in the snapshot — the OS chain
  //    answers the question instead.
  const osProduct = snapshot && release.supportedOsRange
    ? osProductForDevice(snapshot, product)
    : null;
  const range = release.supportedOsRange ? parseOsRange(release.supportedOsRange) : null;
  const maxOsRelease = osProduct && range ? findOsReleaseByMajor(osProduct, range.max) : null;
  if (maxOsRelease) {
    const osEolDate = maxOsRelease.eolFrom || null;
    const osIsEol = maxOsRelease.isEol || isPast(osEolDate, now);
    const familyLatest = latestSupportedOsRelease(osProduct);
    const isAtFamilyLatest = familyLatest
      ? range.max >= parseFloat(familyLatest.id)
      : false;

    if (osIsEol) {
      return {
        variant: 'device-eol',
        reason: 'device-max-os-eol',
        ageYears,
        effectiveEolFrom: honestMaxOsEolDate(osProduct, range.max, osEolDate),
      };
    }
    if (isEolSoon(osEolDate, now)) {
      return {
        variant: 'device-eol-soon',
        reason: isAtFamilyLatest ? 'os-eolFrom-soon' : 'device-max-os-soon',
        ageYears,
        effectiveEolFrom: osEolDate,
      };
    }
    // Max OS is still maintained → device is currently receiving updates. The
    // 'os-current' reason is preserved when device max == family latest so the
    // existing buildLatestOsReminder copy keeps working; otherwise we emit a new
    // 'device-max-os-supported' reason callers can use to nuance copy if desired.
    return {
      variant: 'device-supported',
      reason: isAtFamilyLatest ? 'os-current' : 'device-max-os-supported',
      ageYears,
      effectiveEolFrom: osEolDate,
    };
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
 *
 * For OS-only results (the user picked an OS major directly, like Windows 11 24H2),
 * the picker is binary: just the chosen release as a single option. The user already
 * told us the major; we're only confirming the patch version on top of it.
 */
export function buildOsCheckOptions(snapshot, product, release) {
  if (product.kind === 'os') {
    return [{
      major: parseFloat(release.id) || release.id,
      latestVersion: release.latestVersion || null,
      codename: release.codename || null,
      eolFrom: release.eolFrom || null,
    }];
  }
  const osProduct = osProductForDevice(snapshot, product);
  if (!osProduct) return [];

  const range = parseOsRange(release.supportedOsRange);

  const options = osProduct.releases
    // Match classifyResult()'s EOL semantics: a release with an eolFrom in the
    // past is EOL even if the upstream snapshot hasn't yet flipped isEol=true.
    // Without this guard, the picker would offer a now-EOL major as the success
    // path while classifyResult would (correctly) treat picking it as stuck-on-EOL.
    .filter((r) => !r.isEol && !isPast(r.eolFrom))
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
 * Realistic security-update windows by form factor, used for buying guidance and the
 * Apple support-window estimate. `labelKey` indexes a translation namespace for the
 * noun that gets interpolated ("phones", "laptops", etc.) — desktops read as laptops
 * because users think of iMacs/Mac mini in the same support bucket as MacBooks.
 *
 * These are the conservative cross-vendor numbers (covers Pixel + Samsung +
 * Motorola + OnePlus + Nokia where Apple's track record is longer). Apple's
 * own numbers are higher and come from FAMILY_UPDATE_YEARS_OVERRIDES below.
 */
export const FORM_FACTOR_UPDATE_YEARS = {
  phone: { min: 5, max: 7, labelKey: 'phone' },
  tablet: { min: 5, max: 7, labelKey: 'tablet' },
  laptop: { min: 7, max: 10, labelKey: 'laptop' },
  desktop: { min: 7, max: 10, labelKey: 'laptop' },
  watch: { min: 4, max: 6, labelKey: 'watch' },
};

/**
 * Family-specific overrides that win over the generic form-factor windows.
 * Apple has a longer published track record than the cross-vendor average,
 * so their phones/tablets get tighter, more confident numbers. Anything not
 * overridden falls back to FORM_FACTOR_UPDATE_YEARS.
 *
 * Mac numbers (laptop/desktop): empirical analysis of SOFA's per-model data
 * cross-referenced with macOS EOL dates over n=21 completed support windows
 * (Macs whose max-supported macOS major has already EOL'd) gave median 9.0
 * yrs, IQR 8.7-9.6, range 4.7-11.0. The low outliers are 2019-2020 Intel
 * iMacs that Apple cut quickly during the Apple Silicon transition; most
 * Macs land in 8-10 years. 8-10 covers the typical case better than the
 * cross-vendor 7-10 default and is honest about Apple's actual track record.
 */
export const FAMILY_UPDATE_YEARS_OVERRIDES = {
  apple: {
    phone: { min: 7.5, max: 8, labelKey: 'phone' },
    tablet: { min: 7.5, max: 8, labelKey: 'tablet' },
    laptop: { min: 8, max: 10, labelKey: 'laptop' },
    desktop: { min: 8, max: 10, labelKey: 'laptop' },
  },
};

/**
 * Look up the update-year window for a (family, formFactor) pair. Returns the
 * family override when present, else the form-factor default, else null. Pure.
 */
export function updateYearsFor(family, formFactor) {
  const override = FAMILY_UPDATE_YEARS_OVERRIDES[family]?.[formFactor];
  if (override) return override;
  return FORM_FACTOR_UPDATE_YEARS[formFactor] || null;
}

/**
 * Apple doesn't publish end-of-support dates for devices, so when classifyResult lands
 * on `device-supported` for an Apple product we can still give the user a sense of how
 * much runway they have using FORM_FACTOR_UPDATE_YEARS.
 *
 * Returns null when the estimate isn't useful:
 *   - non-Apple device (other manufacturers either publish or already classify EOL)
 *   - eolFrom is set (we have real data, no estimate needed)
 *   - releaseDate missing/invalid
 *   - form factor not in the window map
 *   - max remaining is non-positive (already past the typical window — classification
 *     will usually have caught this and routed to a non-green variant, but we guard)
 *
 * Otherwise returns:
 *   {
 *     case: 'years-range' | 'years-up-to' | 'months-up-to',
 *     formFactor, deviceLabelKey, minYears, maxYears,
 *     remainingMinYears, remainingMaxYears, remainingMaxMonths,
 *   }
 *
 * `case` tells the renderer which message variant fits the current span; the numeric
 * fields are pre-rounded so the UI just substitutes them into translations.
 */
export function buildAppleSupportEstimate(product, release, now = new Date()) {
  if (!product || product.family !== 'apple') return null;
  if (!release || release.eolFrom) return null;
  if (!release.releaseDate) return null;
  const window = updateYearsFor(product.family, product.formFactor);
  if (!window) return null;
  const releaseTime = new Date(release.releaseDate);
  if (Number.isNaN(releaseTime.getTime())) return null;

  const ageYears = (now - releaseTime) / MS_PER_YEAR;
  const remainingMaxYearsRaw = window.max - ageYears;
  if (remainingMaxYearsRaw <= 0) return null;
  const remainingMinYearsRaw = window.min - ageYears;

  const remainingMaxYears = Math.round(remainingMaxYearsRaw);
  const remainingMinYears = Math.max(0, Math.round(remainingMinYearsRaw));
  const remainingMaxMonths = Math.max(1, Math.round(remainingMaxYearsRaw * 12));

  let kase;
  if (remainingMaxYearsRaw < 1) {
    kase = 'months-up-to';
  } else if (remainingMinYearsRaw < 1) {
    kase = 'years-up-to';
  } else if (remainingMinYears === remainingMaxYears) {
    // Min and max collapse to the same integer once rounded — common when the
    // window is narrow (e.g. Apple's 7.5–8 phone window almost always rounds to
    // a single number). 'X to X years' reads awkwardly; use the single-value
    // 'about X years' phrasing instead.
    kase = 'years-about';
  } else {
    kase = 'years-range';
  }

  return {
    case: kase,
    formFactor: product.formFactor,
    deviceLabelKey: window.labelKey,
    minYears: window.min,
    maxYears: window.max,
    remainingMinYears,
    remainingMaxYears,
    remainingMaxMonths,
  };
}

/**
 * Coarsely format how long ago `date` was, returning either { years } or { months }
 * (whichever is the larger non-zero unit). Used by the DeviceEol title chip
 * ("stopped receiving updates <X ago>"). Returns null when the date is missing,
 * invalid, in the future, or less than a month ago.
 *
 * Pure: takes inputs, returns structured output, no I/O.
 */
const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

export function formatTimeSince(date, now = new Date()) {
  if (!date) return null;
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return null;
  const ms = now - then;
  if (ms <= 0) return null;
  const months = ms / MS_PER_MONTH;
  if (months < 1) return null;
  if (months < 12) return { months: Math.floor(months) };
  return { years: Math.floor(months / 12) };
}

/**
 * Decrement the trailing numeric segment of a dotted version string. Used by the
 * picker so a row anchored on the latest patch (e.g. "15.7.5") can name the
 * range of older patches WITHIN that major as "Between X.0.0 and 15.7.4". Returns
 * null when the trailing segment is non-numeric or already zero — callers should
 * fall back to the "Older than X" wording in that case.
 *
 *   "15.7.5" → "15.7.4"
 *   "15.7.0" → null
 *   "15"     → null (single segment, decrement to 0/1 doesn't read as 'an
 *              earlier patch of major 15')
 *   "abc"    → null
 */
export function decrementPatchVersion(version) {
  if (typeof version !== 'string' || version.length === 0) return null;
  const parts = version.split('.');
  if (parts.length < 2) return null;
  const last = parseInt(parts[parts.length - 1], 10);
  if (!Number.isFinite(last) || last < 1) return null;
  parts[parts.length - 1] = String(last - 1);
  return parts.join('.');
}

/**
 * Symmetric helper for time-until: returns either { years } or { months }
 * (whichever is the larger non-zero unit) for a date in the future. Used by
 * the DeviceConfirmedSummary title chip ("still receiving updates for
 * <X length>"). Returns null when the date is missing, invalid, in the past,
 * or less than a month away.
 */
export function formatTimeUntil(date, now = new Date()) {
  if (!date) return null;
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return null;
  const ms = then - now;
  if (ms <= 0) return null;
  const months = ms / MS_PER_MONTH;
  if (months < 1) return null;
  if (months < 12) return { months: Math.floor(months) };
  return { years: Math.floor(months / 12) };
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

  // Mirror classifyResult's EOL semantics: an OS major is EOL if the upstream
  // flag is set OR its eolFrom has passed, even if the snapshot hasn't yet
  // flipped isEol=true (cron-window race when an EOL date passes mid-day).
  if (target.isEol || isPast(target.eolFrom)) {
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
